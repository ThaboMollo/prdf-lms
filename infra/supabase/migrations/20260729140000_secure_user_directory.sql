-- Authenticated application requests run as the Postgres `authenticated`
-- role so RLS is enforced. That role correctly cannot SELECT auth.users.
-- Expose only the narrow user-directory projections the API needs through
-- SECURITY DEFINER functions with their own authorization checks.

create or replace function public.list_assignable_users()
returns table (
  user_id uuid,
  full_name text,
  roles text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.is_in_role(auth.uid(), 'SuperAdmin')
    or public.is_in_role(auth.uid(), 'Admin')
    or public.is_in_role(auth.uid(), 'LoanOfficer')
    or public.is_in_role(auth.uid(), 'Originator')
    or public.is_in_role(auth.uid(), 'Intern')
  ) then
    raise exception 'Internal role required';
  end if;

  return query
  select
    ur.user_id,
    p.full_name,
    array_agg(distinct r.name order by r.name) as roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.profiles p on p.user_id = ur.user_id
  group by ur.user_id, p.full_name
  having bool_or(r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern'))
     and not bool_or(r.name = 'SuperAdmin')
  order by coalesce(p.full_name, ur.user_id::text);
end;
$$;

revoke all on function public.list_assignable_users() from public, anon;
grant execute on function public.list_assignable_users() to authenticated;

-- The original list function owns the necessary auth.users access. Keep it
-- private and expose a wrapper that removes the hidden platform-owner account.
create or replace function public.admin_access_list_visible(
  p_search text default null,
  p_filter text default 'all',
  p_role text default null
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  roles text[],
  is_admin boolean,
  is_internal boolean,
  can_grant_admin boolean,
  can_revoke_admin boolean,
  grant_disabled_reason text,
  revoke_disabled_reason text
)
language sql
security definer
set search_path = public
as $$
  select
    listed.user_id,
    listed.full_name,
    listed.email,
    listed.roles,
    listed.is_admin,
    listed.is_internal,
    listed.can_grant_admin,
    listed.can_revoke_admin,
    listed.grant_disabled_reason,
    listed.revoke_disabled_reason
  from public.admin_access_list(p_search, p_filter, p_role) listed
  where not listed.is_super_admin;
$$;

revoke all on function public.admin_access_list(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_access_list_visible(text, text, text) from public, anon;
grant execute on function public.admin_access_list_visible(text, text, text) to authenticated;

-- Managed-role wrappers enforce the platform-owner boundary before delegating
-- to the existing audited role mutation functions.
create or replace function public.admin_access_assign_managed_role(
  p_target_user_id uuid,
  p_role_name text
)
returns table (user_id uuid, roles text[], is_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role_name = 'SuperAdmin' then
    raise exception 'SuperAdmin is managed outside the application';
  end if;

  if public.is_in_role(p_target_user_id, 'SuperAdmin') then
    raise exception 'The platform owner is not managed through user access';
  end if;

  return query
  select assigned.user_id, assigned.roles, assigned.is_admin
  from public.admin_access_assign_role(p_target_user_id, p_role_name) assigned;
end;
$$;

create or replace function public.admin_access_remove_managed_role(
  p_target_user_id uuid,
  p_role_name text
)
returns table (user_id uuid, roles text[], is_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role_name = 'SuperAdmin' then
    raise exception 'SuperAdmin is managed outside the application';
  end if;

  if public.is_in_role(p_target_user_id, 'SuperAdmin') then
    raise exception 'The platform owner is not managed through user access';
  end if;

  return query
  select removed.user_id, removed.roles, removed.is_admin
  from public.admin_access_remove_role(p_target_user_id, p_role_name) removed;
end;
$$;

revoke all on function public.admin_access_assign_role(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_access_remove_role(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_access_assign_managed_role(uuid, text) from public, anon;
revoke all on function public.admin_access_remove_managed_role(uuid, text) from public, anon;
grant execute on function public.admin_access_assign_managed_role(uuid, text) to authenticated;
grant execute on function public.admin_access_remove_managed_role(uuid, text) to authenticated;
