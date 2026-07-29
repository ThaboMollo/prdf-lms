-- =============================================================================
-- Supabase compatibility shim — TEST HARNESS ONLY, never applied to a real
-- Supabase project (which provides all of this natively).
--
-- The migration chain depends on Supabase-managed objects that don't exist on
-- vanilla Postgres: the `auth` schema and `auth.users`, `auth.uid()`, the
-- `storage.objects` table, and the `anon` / `authenticated` / `service_role`
-- database roles. This file creates just enough of each to let the real
-- migration chain apply unmodified, so the RLS assertions in 20_assertions.sql
-- are testing the actual policies rather than a reimplementation of them.
--
-- Kept deliberately minimal and faithful: `auth.uid()` in particular mirrors
-- Supabase's real implementation (read `sub` out of the transaction-local
-- `request.jwt.claims` GUC), because that is exactly the mechanism
-- backend-node's RlsTransactionInterceptor relies on in production. If this
-- diverges from Supabase, the tests stop being evidence about production.
-- =============================================================================

-- --- Database roles -------------------------------------------------------
-- Supabase ships these. `authenticated` is the one that matters: RLS policies
-- are declared `to authenticated`, and the API does `set local role
-- authenticated` on every request transaction.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- --- auth schema ----------------------------------------------------------
create schema if not exists auth;

-- Only the columns the migration chain and the signup trigger actually touch.
-- Real auth.users has many more; adding them here would be inventing detail
-- the tests don't exercise.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Faithful to Supabase's implementation, including the ordering detail that
-- matters: `nullif(..., '')` is applied to the raw GUC *before* the ::jsonb
-- cast. Casting an empty string to jsonb raises "invalid input syntax for type
-- json", which would turn every unauthenticated query into an error instead of
-- an empty result. missing_ok = true so an unset GUC yields NULL.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- --- storage schema -------------------------------------------------------
-- Three policies at the end of the baseline migration are declared on
-- storage.objects. Only `bucket_id` and `name` are referenced by them.
create schema if not exists storage;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

-- --- Test helper: impersonate a user --------------------------------------
-- Mirrors what backend-node's RlsTransactionInterceptor does per request:
-- set the JWT claims transaction-locally, then drop to the `authenticated`
-- role so RLS actually applies. Must be called inside a transaction.
create or replace function public.test_login(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true  -- transaction-local, matching transaction-mode pooler constraints
  );
  set local role authenticated;
end;
$$;

-- Return to superuser context for fixture setup between assertions.
create or replace function public.test_logout()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- --- Table privileges -----------------------------------------------------
-- Supabase grants these to anon/authenticated by default (RLS, not GRANT, is
-- what restricts access there). The migration chain assumes it, so without
-- this every policy-protected query fails with "permission denied" rather
-- than returning a filtered result set — which would make the assertions
-- pass for entirely the wrong reason.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- --- Guard: prove RLS can actually bite ------------------------------------
-- PostgreSQL silently bypasses RLS for the table owner (unless FORCE is set)
-- and for anyone holding the owner's privileges. Database roles are
-- cluster-wide, so on a developer machine `authenticated` may already be a
-- member of the owning superuser from some unrelated project — in which case
-- every assertion in this suite would pass vacuously while testing nothing.
--
-- That is exactly what happened when this harness was first written, so it is
-- checked rather than assumed.
create or replace function public.assert_rls_can_bite()
returns void
language plpgsql
as $$
declare
  v_owner name;
begin
  select tableowner into v_owner from pg_tables
   where schemaname = 'public' and tablename = 'loan_applications';

  if v_owner is null then
    raise exception 'assert_rls_can_bite: public.loan_applications not found — migrations not applied?';
  end if;

  if pg_has_role('authenticated', v_owner, 'USAGE') then
    raise exception
      'RLS WOULD BE BYPASSED: role "authenticated" holds the privileges of table owner "%", so PostgreSQL skips row security entirely. Every assertion would pass without testing anything. Fix: own the test objects with a role that "authenticated" is not a member of (run.sh does this), or revoke the membership.',
      v_owner;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.loan_applications'::regclass) then
    raise exception 'RLS is not enabled on public.loan_applications.';
  end if;
end;
$$;
