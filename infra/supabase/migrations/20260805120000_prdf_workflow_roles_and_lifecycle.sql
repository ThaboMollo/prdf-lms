-- PRDF workflow roles + review-chain lifecycle (roles email from Mandisa
-- Nkamba-Kadalie, 2026-08). Introduces the eight stage-owner roles and expands
-- the loan-application status graph to the full review chain.
--
-- Deliberately ADDITIVE and phased for a zero-downtime cutover:
--   * adds the new roles and the new status-transition graph,
--   * migrates in-flight applications off the retired 'UnderReview' status,
--   * does NOT drop the old roles (Intern / Originator / LoanOfficer) or
--     rewrite RLS — those wait for the follow-up migration, because ~50 RLS
--     policies still reference the old role names and dropping them first would
--     silently deny access. The API layer (backend-node) already enforces the
--     new roles; RLS is the second layer and is migrated separately.
--
-- Keep the transition graph in sync with packages/domain/status.ts and
-- backend-node/src/applications/applications.service.ts (LOAN_STATUS_TRANSITIONS).

begin;

-- 1. The eight workflow roles. Constraint-agnostic insert so it runs whether or
--    not roles.name carries a named unique constraint.
insert into public.roles (name)
select v.name
from (values
  ('IntakeClerk'),
  ('ProgramOfficer'),
  ('RiskAnalyst'),
  ('ReviewCommittee'),
  ('ProgramManager'),
  ('Board'),
  ('Legal'),
  ('FinanceOfficer')
) as v(name)
where not exists (select 1 from public.roles r where r.name = v.name);

-- 2. Expand the DB-layer transition guard to the PRDF review chain. Each forward
--    step is owned by one role in the API; the trigger only enforces the graph
--    shape (role ownership stays in backend-node, matching the pre-existing
--    split for this trigger).
create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'Draft' then array['Submitted']
    when 'Submitted' then array['Screening', 'InfoRequested', 'Rejected']
    when 'Screening' then array['DueDiligence', 'InfoRequested', 'Rejected']
    when 'DueDiligence' then array['Evaluation', 'InfoRequested', 'Rejected']
    when 'Evaluation' then array['Approved', 'Rejected']
    when 'InfoRequested' then array['Submitted', 'Screening']
    when 'Approved' then array['BoardApproved', 'Rejected']
    when 'BoardApproved' then array['Contracting', 'Rejected']
    when 'Contracting' then array['Disbursed']
    when 'Disbursed' then array['InRepayment']
    when 'InRepayment' then array['Closed']
    else array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'Invalid status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- 3. Migrate in-flight applications off the retired 'UnderReview' status. They
--    land at the first review stage; move any that are further along by hand if
--    your live data needs a finer split (Screening / DueDiligence / Evaluation).
--    The trigger only guards UPDATEs of status via the transition graph, and
--    this is a direct catch-up write, so temporarily disable it for the sweep.
alter table public.loan_applications disable trigger trg_enforce_status_transition;
update public.loan_applications set status = 'Screening' where status = 'UnderReview';
alter table public.loan_applications enable trigger trg_enforce_status_transition;

commit;

-- ───────────────────────────────────────────────────────────────────────────
-- REVIEW BEFORE RUNNING — staff role remap (left commented; this is your call).
-- Which person takes which stage role is an org decision, so it is not applied
-- automatically. Suggested default mapping from the retired roles:
--
--   insert into public.user_roles (user_id, role_id)
--   select ur.user_id, nr.id
--   from public.user_roles ur
--   join public.roles r  on r.id = ur.role_id
--   join (values
--     ('LoanOfficer', 'ProgramManager'),
--     ('Originator',  'ProgramOfficer'),
--     ('Intern',      'IntakeClerk')
--   ) as m(old_role, new_role) on m.old_role = r.name
--   join public.roles nr on nr.name = m.new_role
--   on conflict do nothing;
--
-- FOLLOW-UP MIGRATION (not here): rewrite every RLS policy that references
-- 'Intern' / 'Originator' / 'LoanOfficer' to the new roles, then remove the old
-- role rows and any leftover user_roles pointing at them. Only after that is it
-- safe to retire the old roles.
