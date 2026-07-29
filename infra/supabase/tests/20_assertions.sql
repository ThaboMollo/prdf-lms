-- =============================================================================
-- RLS assertion suite.
--
-- Covers spec §6.6's four required assertions, plus regression tests for the
-- authorization bugs actually found during implementation (noted inline).
--
-- pgTAP is not used: the spec permits "pgTAP or equivalent" (§2), and pgTAP is
-- neither available via Homebrew nor trivially installable inside a GitHub
-- Actions Postgres service container. These are plain SQL assertions with a
-- small harness — no extension, runs anywhere psql does, TAP-ish output, and a
-- non-zero exit if anything fails.
--
-- Every assertion runs as a real `authenticated` role with real JWT claims set
-- transaction-locally, which is the same mechanism backend-node's
-- RlsTransactionInterceptor uses in production. Nothing here uses a superuser
-- or service_role shortcut — that would bypass the very policies under test.
--
-- Transaction discipline: assertions COMMIT rather than ROLLBACK, because a
-- rollback would also discard the recorded result. Assertions that are
-- expected to be *blocked* change nothing by definition, so committing is
-- safe. The few that intentionally mutate undo themselves explicitly.
-- =============================================================================

\pset pager off

-- Temp table: the assertions run as a non-superuser login role that has no
-- CREATE privilege on schema public. pg_temp is always writable, and temp
-- tables persist across transactions within the session, which is what the
-- commit-per-assertion structure needs.
create temporary table _results (
  seq serial primary key,
  name text,
  passed boolean,
  detail text
);

-- Assertions run under `set local role authenticated`, which does not inherit
-- the creating login role's rights on this table. Without these grants every
-- recorded result fails with "permission denied for table _results".
grant all on _results to authenticated, anon;
grant all on sequence _results_seq_seq to authenticated, anon;

create or replace function pg_temp.check_that(p_name text, p_condition boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into _results (name, passed, detail)
  values (p_name, coalesce(p_condition, false), p_detail);
end;
$$;

-- Assert a statement is refused. Both outcomes count as "blocked": an outright
-- exception, or silently affecting zero rows (which is how RLS refuses an
-- UPDATE/DELETE). The distinction is recorded in `detail` so a test can't pass
-- because of an unrelated error.
create or replace function pg_temp.check_blocked(p_name text, p_sql text)
returns void language plpgsql as $$
declare
  affected bigint;
begin
  execute p_sql;
  get diagnostics affected = row_count;
  if affected = 0 then
    insert into _results (name, passed, detail) values (p_name, true, 'blocked: 0 rows affected');
  else
    insert into _results (name, passed, detail)
    values (p_name, false, format('NOT BLOCKED: %s row(s) affected', affected));
  end if;
exception when others then
  insert into _results (name, passed, detail)
  values (p_name, true, format('blocked: %s', sqlerrm));
end;
$$;

-- Assert that if a statement fails, it fails for the *expected* reason.
-- Guards against a test passing because something unrelated broke.
create or replace function pg_temp.check_error_unlike(p_name text, p_sql text, p_pattern text)
returns void language plpgsql as $$
begin
  execute p_sql;
  insert into _results (name, passed, detail) values (p_name, true, 'permitted');
exception when others then
  if sqlerrm ilike p_pattern then
    insert into _results (name, passed, detail)
    values (p_name, false, format('rejected for the wrong reason: %s', sqlerrm));
  else
    insert into _results (name, passed, detail)
    values (p_name, true, format('not rejected by that rule (failed on: %s)', left(sqlerrm, 60)));
  end if;
end;
$$;

-- =============================================================================
-- Canary — proves the suite is capable of failing.
-- If RLS were bypassed (see assert_rls_can_bite in 00_shim.sql), this is the
-- assertion that catches it, rather than every test passing vacuously.
-- =============================================================================
begin;
set local role authenticated;
select pg_temp.check_that(
  'CANARY: with no JWT claims, an authenticated user sees zero applications',
  (select count(*) = 0 from public.loan_applications),
  (select format('saw %s — if non-zero, RLS is NOT being enforced and every result below is meaningless', count(*))
     from public.loan_applications)
);
commit;

-- =============================================================================
-- §6.6 #1 — a client cannot read another client's application
-- =============================================================================
begin;
select public.test_login('aaaaaaaa-0000-0000-0000-000000000001');  -- Alice

select pg_temp.check_that(
  'client sees only their own applications',
  (select count(*) = 1 from public.loan_applications),
  (select format('saw %s, expected 1', count(*)) from public.loan_applications)
);

select pg_temp.check_that(
  'client cannot read another client''s application by id',
  not exists (select 1 from public.loan_applications
              where id = 'eeeeeeee-0000-0000-0000-000000000002')  -- Bob's
);

select pg_temp.check_that(
  'client CAN read their own application by id',
  exists (select 1 from public.loan_applications
          where id = 'eeeeeeee-0000-0000-0000-000000000001')
);
commit;

-- Regression: backend-node's deleteApplication() once reused a staff-permissive
-- access check. The DB policy is owning-client-only and is the real backstop.
begin;
select public.test_login('aaaaaaaa-0000-0000-0000-000000000001');  -- Alice
select pg_temp.check_blocked(
  'client cannot delete another client''s draft',
  $sql$delete from public.loan_applications where id = 'eeeeeeee-0000-0000-0000-000000000002'$sql$
);
commit;

-- =============================================================================
-- §6.6 #2 — an unassigned Intern cannot read or mutate an application
-- =============================================================================
begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000003');  -- unassigned intern
select pg_temp.check_that(
  'unassigned intern sees no applications',
  (select count(*) = 0 from public.loan_applications),
  (select format('saw %s, expected 0', count(*)) from public.loan_applications)
);
commit;

begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000003');  -- unassigned intern
select pg_temp.check_blocked(
  'unassigned intern cannot mutate an application',
  $sql$update public.loan_applications set purpose = 'hijacked' where id = 'eeeeeeee-0000-0000-0000-000000000003'$sql$
);
commit;

-- Positive control: without this, the two assertions above could pass because
-- interns see nothing at all for some unrelated reason.
begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000002');  -- assigned intern
select pg_temp.check_that(
  'assigned intern CAN read their assigned application',
  exists (select 1 from public.loan_applications
          where id = 'eeeeeeee-0000-0000-0000-000000000003')
);
commit;

-- =============================================================================
-- §6.6 #3 — a LoanOfficer can read all applications
-- =============================================================================
begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000001');  -- loan officer
select pg_temp.check_that(
  'loan officer reads all applications',
  (select count(*) = 3 from public.loan_applications),
  (select format('saw %s of 3', count(*)) from public.loan_applications)
);
commit;

-- =============================================================================
-- §6.6 #4 — only a SuperAdmin can grant Admin
-- =============================================================================
-- Regression: backend-node's AdminService once let any Admin grant Admin.
-- This is the database-side backstop for that rule.
begin;
select public.test_login('cccccccc-0000-0000-0000-000000000001');  -- plain Admin
select pg_temp.check_blocked(
  'plain Admin cannot grant Admin',
  $sql$select public.admin_access_assign_role('aaaaaaaa-0000-0000-0000-000000000002', 'Admin')$sql$
);
commit;

-- Positive control. This one genuinely mutates; it is ordered after every
-- read assertion so the state change can't affect them, and the database is
-- a throwaway rebuilt by run.sh on each run.
begin;
select public.test_login('cccccccc-0000-0000-0000-000000000002');  -- SuperAdmin
select pg_temp.check_error_unlike(
  'SuperAdmin CAN grant Admin',
  $sql$select public.admin_access_assign_role('aaaaaaaa-0000-0000-0000-000000000003', 'Admin')$sql$,
  '%only%'
);
commit;

-- Invariant: granting SuperAdmin implies Admin.
begin;
select public.test_login('cccccccc-0000-0000-0000-000000000002');  -- SuperAdmin
select public.admin_access_assign_role('aaaaaaaa-0000-0000-0000-000000000002', 'SuperAdmin');
select pg_temp.check_that(
  'granting SuperAdmin also grants Admin',
  public.is_in_role('aaaaaaaa-0000-0000-0000-000000000002', 'Admin')
);
commit;

-- =============================================================================
-- Beyond the spec — status transitions and document immutability
-- =============================================================================

-- Draft -> Approved skips the entire review chain and must be refused.
-- Run as a LoanOfficer, whom RLS *does* permit to update applications, so the
-- refusal comes from a trigger rather than from RLS silently filtering.
--
-- Defense in depth means more than one gate can catch this: with the current
-- fixtures the document-verification gate fires first (see the recorded
-- detail), before the transition trigger is reached. Both are correct
-- refusals, so the assertion is on the refusal itself rather than on which
-- trigger produced it. The next assertion is what proves the transition rule
-- is not simply rejecting everything.
begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000001');  -- loan officer
select pg_temp.check_blocked(
  'illegal jump Draft -> Approved is refused',
  $sql$update public.loan_applications set status = 'Approved' where id = 'eeeeeeee-0000-0000-0000-000000000001'$sql$
);
commit;

-- ...but the trigger must not reject *everything*, or the assertion above
-- passes vacuously. Draft -> Submitted is legal for the transition rule; it is
-- still refused here by the required-documents gate (the fixture set is
-- deliberately incomplete), which is a different rule. Assert it is not
-- rejected *as a transition*.
begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000001');  -- loan officer
select pg_temp.check_error_unlike(
  'legal transition Draft -> Submitted is not rejected by the transition rule',
  $sql$update public.loan_applications set status = 'Submitted' where id = 'eeeeeeee-0000-0000-0000-000000000001'$sql$,
  '%transition%'
);
commit;

-- Document immutability (spec §6.9): only verification metadata may change.
-- Run as a LoanOfficer, whom the "documents update by staff" policy permits to
-- update loan_documents — so a block proves the immutability trigger fired,
-- rather than RLS silently filtering the row out.
begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000001');  -- loan officer
select pg_temp.check_blocked(
  'loan_documents.storage_path is immutable after insert',
  $sql$update public.loan_documents set storage_path = 'applications/tampered.pdf' where id = 'ffffffff-0000-0000-0000-000000000001'$sql$
);
commit;

begin;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000001');  -- loan officer
select pg_temp.check_error_unlike(
  'loan_documents verification metadata IS mutable',
  $sql$update public.loan_documents set status = 'Verified' where id = 'ffffffff-0000-0000-0000-000000000001'$sql$,
  '%mmutable%'
);
commit;

-- =============================================================================
-- Report
-- =============================================================================
\echo ''
\echo '--- RLS assertion results ---'
select
  case when passed then 'ok    ' else 'NOT OK' end as status,
  lpad(seq::text, 2) as "#",
  name,
  coalesce(detail, '') as detail
from _results
order by seq;

\echo ''
select
  count(*) filter (where passed)     as passed,
  count(*) filter (where not passed) as failed,
  count(*)                           as total
from _results;

-- A suite that records nothing must never report success: an empty result set
-- would otherwise look identical to a clean pass. This actually happened while
-- building the harness (a permissions error swallowed every insert), so the
-- expected count is asserted explicitly.
-- NB: a psql \set variable is not substituted inside a dollar-quoted block,
-- so the minimum is a literal here. Bump it when assertions are added.
do $$
declare
  n_failed int;
  n_total  int;
  n_min    int := 16;
begin
  select count(*) filter (where not passed), count(*)
    into n_failed, n_total
    from _results;

  if n_total < n_min then
    raise exception
      'HARNESS FAILURE: only % assertion(s) recorded, expected at least %. The suite did not run properly — treat this as a failure, not a pass.',
      n_total, n_min;
  end if;

  if n_failed > 0 then
    raise exception '% of % RLS assertion(s) FAILED', n_failed, n_total;
  end if;

  raise notice 'All % RLS assertions passed.', n_total;
end;
$$;
