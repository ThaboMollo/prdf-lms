-- Workflow-role RBAC catch-up + lock the Client role out of admin granting.
--
-- Two things this migration fixes:
--
-- 1. The eight PRDF workflow roles added in 20260805120000_prdf_workflow_roles_
--    and_lifecycle.sql (IntakeClerk, ProgramOfficer, RiskAnalyst, ReviewCommittee,
--    ProgramManager, Board, Legal, FinanceOfficer) were never added to the RBAC
--    helper functions. As a result they could not be granted through the admin
--    UI (admin_access_assign_role raised 'Unsupported role assignment'), were not
--    counted as internal in admin_access_list, and never surfaced in
--    list_assignable_users. This brings all three functions in line with
--    backend-node/src/auth/roles.helper.ts (INTERNAL_ROLES / WORKFLOW_ROLES).
--
-- 2. The Client role identifies portal users and is assigned automatically at
--    signup (handle_new_user trigger) / assisted onboarding. It must NOT be
--    grantable from the admin — no actor, not even SuperAdmin. The admin UI and
--    backend already refuse it; admin_access_assign_managed_role now rejects it
--    too so the boundary holds even against a direct RPC call. Removal of Client
--    stays permitted (admin_access_remove_managed_role is unchanged).
--
-- All function bodies below are reproduced verbatim from their prior definitions
-- (20260723180000_baseline.sql, 20260729140000_secure_user_directory.sql,
-- 20260730100000_assignable_users_email_fallback.sql) except for the role-list
-- lines called out in comments. create or replace preserves existing grants, so
-- the revoke/grant matrix from 20260729140000 is intentionally left untouched.

-- ---------------------------------------------------------------------------
-- admin_access_assign_role: allowlist now includes the 8 workflow roles.
-- ---------------------------------------------------------------------------
create or replace function public.admin_access_assign_role(
  p_target_user_id uuid,
  p_role_name text
)
returns table (
  user_id uuid,
  roles text[],
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_target_exists boolean := false;
  v_role_id bigint;
  v_admin_role_id bigint;
  v_target_email text;
  v_target_full_name text;
  v_prior_roles text[] := '{}'::text[];
  v_result_roles text[] := '{}'::text[];
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Added the 8 workflow roles to the assignable allowlist.
  if p_role_name not in (
    'Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin',
    'IntakeClerk', 'ProgramOfficer', 'RiskAnalyst', 'ReviewCommittee',
    'ProgramManager', 'Board', 'Legal', 'FinanceOfficer'
  ) then
    raise exception 'Unsupported role assignment';
  end if;

  if p_role_name in ('Admin', 'SuperAdmin') then
    if not public.is_in_role(v_actor_user_id, 'SuperAdmin') then
      raise exception 'SuperAdmin role required to assign Admin or SuperAdmin';
    end if;
  elsif not (public.is_in_role(v_actor_user_id, 'Admin') or public.is_in_role(v_actor_user_id, 'SuperAdmin')) then
    raise exception 'Admin role required';
  end if;

  select exists (select 1 from auth.users u where u.id = p_target_user_id)
  into v_target_exists;
  if not v_target_exists then
    raise exception 'Target user does not exist';
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_prior_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  select r.id into v_role_id from public.roles r where r.name = p_role_name limit 1;
  if v_role_id is null then
    raise exception 'Role is not configured';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (p_target_user_id, v_role_id)
  on conflict do nothing;

  if p_role_name = 'SuperAdmin' then
    select r.id into v_admin_role_id from public.roles r where r.name = 'Admin' limit 1;
    if v_admin_role_id is not null then
      insert into public.user_roles (user_id, role_id)
      values (p_target_user_id, v_admin_role_id)
      on conflict do nothing;
    end if;
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_result_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  select u.email, p.full_name
  into v_target_email, v_target_full_name
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id = p_target_user_id;

  insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata)
  values (
    'UserAccess', p_target_user_id::text, 'RoleGranted', v_actor_user_id,
    jsonb_build_object(
      'source', 'admin-ui', 'assignedRole', p_role_name,
      'targetEmail', v_target_email, 'targetFullName', v_target_full_name,
      'priorRoles', v_prior_roles, 'resultingRoles', v_result_roles
    )
  );

  return query
  select p_target_user_id, v_result_roles, ('Admin' = any(v_result_roles));
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_access_remove_role: allowlist now includes the 8 workflow roles.
-- ---------------------------------------------------------------------------
create or replace function public.admin_access_remove_role(
  p_target_user_id uuid,
  p_role_name text
)
returns table (
  user_id uuid,
  roles text[],
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_role_id bigint;
  v_target_email text;
  v_target_full_name text;
  v_prior_roles text[] := '{}'::text[];
  v_result_roles text[] := '{}'::text[];
  v_role_holder_count integer := 0;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Added the 8 workflow roles to the removable allowlist.
  if p_role_name not in (
    'Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin',
    'IntakeClerk', 'ProgramOfficer', 'RiskAnalyst', 'ReviewCommittee',
    'ProgramManager', 'Board', 'Legal', 'FinanceOfficer'
  ) then
    raise exception 'Unsupported role';
  end if;

  if p_role_name in ('Admin', 'SuperAdmin') then
    if not public.is_in_role(v_actor_user_id, 'SuperAdmin') then
      raise exception 'SuperAdmin role required to revoke Admin or SuperAdmin';
    end if;
    if p_target_user_id = v_actor_user_id then
      raise exception 'You cannot revoke your own % access', p_role_name;
    end if;
  elsif not (public.is_in_role(v_actor_user_id, 'Admin') or public.is_in_role(v_actor_user_id, 'SuperAdmin')) then
    raise exception 'Admin role required';
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_prior_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  if p_role_name = 'Admin' and 'SuperAdmin' = any(v_prior_roles) then
    raise exception 'Remove SuperAdmin before removing Admin';
  end if;

  if p_role_name in ('Admin', 'SuperAdmin') and p_role_name = any(v_prior_roles) then
    select count(distinct ur.user_id)
    into v_role_holder_count
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = p_role_name;
    if v_role_holder_count <= 1 then
      raise exception 'Cannot remove the last remaining %', p_role_name;
    end if;
  end if;

  select r.id into v_role_id from public.roles r where r.name = p_role_name limit 1;
  if v_role_id is null then
    raise exception 'Role is not configured';
  end if;

  delete from public.user_roles ur
  where ur.user_id = p_target_user_id and ur.role_id = v_role_id;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_result_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  select u.email, p.full_name
  into v_target_email, v_target_full_name
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id = p_target_user_id;

  insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata)
  values (
    'UserAccess', p_target_user_id::text, 'RoleRevoked', v_actor_user_id,
    jsonb_build_object(
      'source', 'admin-ui', 'revokedRole', p_role_name,
      'targetEmail', v_target_email, 'targetFullName', v_target_full_name,
      'priorRoles', v_prior_roles, 'resultingRoles', v_result_roles
    )
  );

  return query
  select p_target_user_id, v_result_roles, ('Admin' = any(v_result_roles));
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_access_list: is_internal now counts the 8 workflow roles.
-- ---------------------------------------------------------------------------
create or replace function public.admin_access_list(
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
  is_super_admin boolean,
  is_internal boolean,
  can_grant_admin boolean,
  can_revoke_admin boolean,
  grant_disabled_reason text,
  revoke_disabled_reason text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_is_super boolean := false;
  v_admin_count integer := 0;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (public.is_in_role(v_actor_user_id, 'Admin') or public.is_in_role(v_actor_user_id, 'SuperAdmin')) then
    raise exception 'Admin role required';
  end if;

  if p_filter not in ('all', 'internal', 'clients', 'admins', 'non-admins') then
    raise exception 'Invalid filter value';
  end if;

  v_actor_is_super := public.is_in_role(v_actor_user_id, 'SuperAdmin');

  select count(distinct ur.user_id)
  into v_admin_count
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where r.name = 'Admin';

  return query
  with role_agg as (
    select
      u.id as user_id,
      p.full_name,
      u.email,
      array_agg(distinct r.name order by r.name) filter (where r.name is not null) as roles,
      bool_or(r.name = 'Admin') as is_admin,
      bool_or(r.name = 'SuperAdmin') as is_super_admin,
      -- Added the 8 workflow roles to the internal-user computation.
      bool_or(r.name in (
        'Admin', 'SuperAdmin', 'LoanOfficer', 'Originator', 'Intern',
        'IntakeClerk', 'ProgramOfficer', 'RiskAnalyst', 'ReviewCommittee',
        'ProgramManager', 'Board', 'Legal', 'FinanceOfficer'
      )) as is_internal,
      bool_or(r.name = 'Client') as is_client
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    left join public.roles r on r.id = ur.role_id
    group by u.id, p.full_name, u.email
  ),
  filtered as (
    select
      ra.user_id, ra.full_name, ra.email,
      coalesce(ra.roles, '{}'::text[]) as roles,
      coalesce(ra.is_admin, false) as is_admin,
      coalesce(ra.is_super_admin, false) as is_super_admin,
      coalesce(ra.is_internal, false) as is_internal
    from role_agg ra
    where (
        p_search is null
        or coalesce(ra.full_name, '') ilike '%' || p_search || '%'
        or coalesce(ra.email, '') ilike '%' || p_search || '%'
      )
      and (p_role is null or p_role = any(ra.roles))
      and (
        p_filter = 'all'
        or (p_filter = 'internal' and ra.is_internal)
        or (p_filter = 'clients' and not ra.is_internal)
        or (p_filter = 'admins' and ra.is_admin)
        or (p_filter = 'non-admins' and ra.is_internal and not ra.is_admin)
      )
  )
  select
    f.user_id, f.full_name::text, f.email::text, f.roles,
    f.is_admin, f.is_super_admin, f.is_internal,
    (v_actor_is_super and not f.is_admin) as can_grant_admin,
    (v_actor_is_super and f.is_admin and f.user_id <> v_actor_user_id and v_admin_count > 1) as can_revoke_admin,
    case
      when not v_actor_is_super then 'Only a SuperAdmin can grant Admin access.'
      when f.is_admin then 'User already has Admin access.'
      else null
    end as grant_disabled_reason,
    case
      when not v_actor_is_super then 'Only a SuperAdmin can revoke Admin access.'
      when not f.is_admin then 'User is not an Admin.'
      when f.user_id = v_actor_user_id then 'You cannot revoke your own Admin access.'
      when v_admin_count <= 1 then 'Cannot revoke the last remaining Admin.'
      else null
    end as revoke_disabled_reason
  from filtered f
  order by coalesce(f.full_name, f.email, f.user_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_assignable_users: workflow roles may call it and appear as assignable.
-- Return type is unchanged, so create or replace is fine here.
-- ---------------------------------------------------------------------------
create or replace function public.list_assignable_users()
returns table (
  user_id uuid,
  full_name text,
  email text,
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

  -- Any internal role may resolve the assignee list (matches the admin UI,
  -- which exposes application/task assignment to every internal role).
  if not (
    public.is_in_role(auth.uid(), 'SuperAdmin')
    or public.is_in_role(auth.uid(), 'Admin')
    or public.is_in_role(auth.uid(), 'LoanOfficer')
    or public.is_in_role(auth.uid(), 'Originator')
    or public.is_in_role(auth.uid(), 'Intern')
    or public.is_in_role(auth.uid(), 'IntakeClerk')
    or public.is_in_role(auth.uid(), 'ProgramOfficer')
    or public.is_in_role(auth.uid(), 'RiskAnalyst')
    or public.is_in_role(auth.uid(), 'ReviewCommittee')
    or public.is_in_role(auth.uid(), 'ProgramManager')
    or public.is_in_role(auth.uid(), 'Board')
    or public.is_in_role(auth.uid(), 'Legal')
    or public.is_in_role(auth.uid(), 'FinanceOfficer')
  ) then
    raise exception 'Internal role required';
  end if;

  return query
  select
    ur.user_id,
    p.full_name,
    u.email::text,
    array_agg(distinct r.name order by r.name) as roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.profiles p on p.user_id = ur.user_id
  join auth.users u on u.id = ur.user_id
  group by ur.user_id, p.full_name, u.email
  having bool_or(r.name in (
      'Admin', 'LoanOfficer', 'Originator', 'Intern',
      'IntakeClerk', 'ProgramOfficer', 'RiskAnalyst', 'ReviewCommittee',
      'ProgramManager', 'Board', 'Legal', 'FinanceOfficer'
    ))
     and not bool_or(r.name = 'SuperAdmin')
  order by coalesce(p.full_name, u.email::text, ur.user_id::text);
end;
$$;

revoke all on function public.list_assignable_users() from public, anon;
grant execute on function public.list_assignable_users() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_access_assign_managed_role: reject Client grants at the DB boundary.
-- Removal wrapper is deliberately left unchanged (Client stays removable).
-- ---------------------------------------------------------------------------
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

  -- The Client role identifies portal users and is granted automatically at
  -- signup. It cannot be handed out from the admin by anyone, SuperAdmin
  -- included. (Removal remains allowed via admin_access_remove_managed_role.)
  if p_role_name = 'Client' then
    raise exception 'The Client role is assigned automatically at signup and cannot be granted from the admin';
  end if;

  if public.is_in_role(p_target_user_id, 'SuperAdmin') then
    raise exception 'The platform owner is not managed through user access';
  end if;

  return query
  select assigned.user_id, assigned.roles, assigned.is_admin
  from public.admin_access_assign_role(p_target_user_id, p_role_name) assigned;
end;
$$;
