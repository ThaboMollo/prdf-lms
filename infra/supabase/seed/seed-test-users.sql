-- ===========================================================================
-- PRDF LMS — test users, one per role (idempotent)
-- ===========================================================================
-- Creates one confirmed email/password auth user for every role in the system
-- so each role's journey (see docs/roles-and-access.md) can be exercised, plus
-- one Client+Admin dual user to demonstrate that combination.
--
-- Shared password for every account:  Prdf-Test-2026!
--
-- HOW TO RUN
--   Local stack (Supabase CLI):   supabase db reset   (then this runs if wired
--                                 into supabase/config seed) OR run directly:
--   psql "$SUPABASE_DB_URL" -f infra/supabase/seed/seed-test-users.sql
--   Remote/dev project:           psql "<connection string>" -f <this file>
--
-- SAFETY
--   * Idempotent — deterministic UUIDs (md5 of the email) + full role reset, so
--     re-running converges to the same state without duplicates.
--   * TEST DATA ONLY. Do not run against production. Every email is @prdf.test.
--   * The handle_new_user trigger auto-grants Client to every new auth user;
--     seed_test_user() resets each account to EXACTLY the roles listed below,
--     so internal accounts do not silently carry a Client role.
-- ===========================================================================

set search_path = public, extensions, auth;

-- pgcrypto provides crypt()/gen_salt() for the bcrypt password hash.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: upsert a confirmed password user + identity + profile, then set the
-- account's role set to EXACTLY p_roles (removing any trigger-granted Client).
-- ---------------------------------------------------------------------------
create or replace function public.seed_test_user(
  p_email text,
  p_full_name text,
  p_password text,
  p_roles text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user_id uuid := md5('prdf-test:' || p_email)::uuid;
begin
  -- auth.users: confirmed email/password account.
  --
  -- The token/email-change columns MUST be '' (empty string), not NULL. GoTrue
  -- selects them as Go strings on every password login; a NULL makes it fail
  -- with "Database error querying schema" (HTTP 500) even though the row looks
  -- valid. Directly-inserted rows don't get these defaults unless we set them.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, email_change_confirm_status,
    phone_change, phone_change_token, reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name),
    '', '', '', '', '', 0, '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password,
        email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
        raw_user_meta_data = excluded.raw_user_meta_data,
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change = '',
        email_change_token_current = '',
        email_change_confirm_status = 0,
        phone_change = '',
        phone_change_token = '',
        reauthentication_token = '',
        updated_at = now();

  -- auth.identities: email identity so GoTrue treats the account normally.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  -- public.profiles (full_name is NOT NULL).
  insert into public.profiles (user_id, full_name)
  values (v_user_id, p_full_name)
  on conflict (user_id) do update set full_name = excluded.full_name;

  -- Reset to exactly the requested roles (clears the trigger-granted Client for
  -- internal accounts and makes re-runs converge).
  delete from public.user_roles where user_id = v_user_id;
  insert into public.user_roles (user_id, role_id)
  select v_user_id, r.id
  from public.roles r
  where r.name = any(p_roles)
  on conflict do nothing;

  return v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed one user per role (+ one Client+Admin dual user).
-- ---------------------------------------------------------------------------
select public.seed_test_user('superadmin@prdf.test',     'Test SuperAdmin',      'Prdf-Test-2026!', array['SuperAdmin']);
select public.seed_test_user('admin@prdf.test',           'Test Admin',           'Prdf-Test-2026!', array['Admin']);
select public.seed_test_user('intakeclerk@prdf.test',     'Test Intake Clerk',    'Prdf-Test-2026!', array['IntakeClerk']);
select public.seed_test_user('programofficer@prdf.test',  'Test Program Officer', 'Prdf-Test-2026!', array['ProgramOfficer']);
select public.seed_test_user('riskanalyst@prdf.test',     'Test Risk Analyst',    'Prdf-Test-2026!', array['RiskAnalyst']);
select public.seed_test_user('reviewcommittee@prdf.test', 'Test Review Committee','Prdf-Test-2026!', array['ReviewCommittee']);
select public.seed_test_user('programmanager@prdf.test',  'Test Program Manager', 'Prdf-Test-2026!', array['ProgramManager']);
select public.seed_test_user('board@prdf.test',           'Test Board Member',    'Prdf-Test-2026!', array['Board']);
select public.seed_test_user('legal@prdf.test',           'Test Legal',           'Prdf-Test-2026!', array['Legal']);
select public.seed_test_user('financeofficer@prdf.test',  'Test Finance Officer', 'Prdf-Test-2026!', array['FinanceOfficer']);
select public.seed_test_user('client@prdf.test',          'Test Client',          'Prdf-Test-2026!', array['Client']);
-- Dual account: can enter the admin portal (Admin) while also being a portal
-- Client. Demonstrates the client+admin combination.
select public.seed_test_user('clientadmin@prdf.test',     'Test Client Admin',    'Prdf-Test-2026!', array['Client', 'Admin']);

-- ---------------------------------------------------------------------------
-- Verify: list the seeded accounts and their resolved roles.
-- ---------------------------------------------------------------------------
select u.email,
       coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}') as roles
from auth.users u
left join public.user_roles ur on ur.user_id = u.id
left join public.roles r on r.id = ur.role_id
where u.email like '%@prdf.test'
group by u.email
order by u.email;

-- Clean up the helper so it does not linger as an executable SECURITY DEFINER.
drop function public.seed_test_user(text, text, text, text[]);
