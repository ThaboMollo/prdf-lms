-- Read-only RBAC / migration state check.
-- Run in the Supabase SQL Editor (or psql) and share the result.
-- Reveals: seeded roles, RBAC functions + signatures, the signup trigger,
-- role distribution, users with no roles (the propagation gap), and whether
-- the reporting columns (province/spatial_type) are present.

with checks as (
  -- Which roles exist (is SuperAdmin seeded?)
  select 1 as sort, 'role'::text as section, name::text as item, ''::text as detail
  from public.roles

  union all
  -- Which RBAC functions exist + their exact signatures
  select 2, 'function',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'returns ' || pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_my_roles','handle_new_user','is_in_role',
      'admin_access_list','admin_access_assign_role','admin_access_remove_role',
      'admin_access_grant','admin_access_revoke'
    )

  union all
  -- Signup trigger that seeds the Client role
  select 3, 'trigger',
         t.tgname || ' on ' || n.nspname || '.' || c.relname,
         'enabled=' || t.tgenabled::text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and t.tgname = 'on_auth_user_created'

  union all
  -- Role distribution across users
  select 4, 'user_roles_count', coalesce(r.name, '(none)'), count(*)::text
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  group by r.name

  union all
  -- The smoking gun: users with NO rows in user_roles
  select 5, 'users_without_roles', 'count',
         (select count(*) from auth.users u
          where not exists (select 1 from public.user_roles ur where ur.user_id = u.id))::text

  union all
  select 6, 'total_users', 'auth.users', (select count(*) from auth.users)::text

  union all
  -- Bonus: confirm reporting-migration columns (province/spatial_type) state
  select 7, 'clients_column', column_name::text, data_type::text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients'
    and column_name in ('province','spatial_type','gender','is_rural','is_black_women_owned')
)
select section, item, detail
from checks
order by sort, section, item;


-- ---------------------------------------------------------------------------
-- Per-user role check.
-- Confirms a specific user's roles at the DB level (isolates any remaining
-- "permissions don't update" issue to the front-end build). Replace the email,
-- then run this statement on its own.
-- Note: get_my_roles() can't be tested here — it keys off auth.uid(), which is
-- null in the SQL Editor. Verify it by logging into the deployed UI instead.
-- ---------------------------------------------------------------------------
select u.email,
       coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}') as roles
from auth.users u
left join public.user_roles ur on ur.user_id = u.id
left join public.roles r on r.id = ur.role_id
where u.email = 'REPLACE_WITH_TEST_USER_EMAIL'
group by u.email;
