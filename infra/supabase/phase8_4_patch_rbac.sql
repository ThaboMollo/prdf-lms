-- RBAC propagation fix + SuperAdmin role.
--
-- Problem this fixes: role assignments were written to public.user_roles but the
-- front-end derived permissions from JWT metadata, which is never synced. As a
-- result granted roles never took effect in the UI. This migration makes the DB
-- the single source of truth (read via get_my_roles), seeds roles on signup, and
-- introduces a distinct SuperAdmin role that exclusively manages Admin/SuperAdmin.
--
-- Apply order: after phase7_6_patch.sql (admin_access_* functions) and rls.sql
-- (is_in_role). Idempotent — safe to re-run.

-- 0. Drops --------------------------------------------------------------------
-- admin_access_list gains an is_super_admin column, so its return type changes
-- (create-or-replace cannot change a function's return type — must drop first).
drop function if exists public.admin_access_list(text, text, text);
-- Retire the Admin-only grant/revoke path: granting Admin is now SuperAdmin-only
-- and flows through admin_access_assign_role / admin_access_remove_role.
drop function if exists public.admin_access_grant(uuid);
drop function if exists public.admin_access_revoke(uuid);

-- 1. Seed the SuperAdmin role -------------------------------------------------
insert into public.roles (name)
values ('SuperAdmin')
on conflict (name) do nothing;

-- 2. get_my_roles(): caller's role names, the same source RLS trusts ----------
create or replace function public.get_my_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;

grant execute on function public.get_my_roles() to authenticated;

-- 3. Seed a Client role for every new signup ---------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_role_id bigint;
begin
  select id into v_client_role_id from public.roles where name = 'Client' limit 1;
  if v_client_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, v_client_role_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: existing users with no roles get the Client baseline.
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from auth.users u
cross join public.roles r
where r.name = 'Client'
  and not exists (select 1 from public.user_roles ur where ur.user_id = u.id)
on conflict do nothing;

-- 4. Bootstrap: promote existing Admins to SuperAdmin so the system is
--    operable (at least one account can manage Admin/SuperAdmin). Adjust as
--    needed for your environment.
insert into public.user_roles (user_id, role_id)
select ur.user_id, (select id from public.roles where name = 'SuperAdmin')
from public.user_roles ur
join public.roles r on r.id = ur.role_id
where r.name = 'Admin'
on conflict do nothing;

-- 5. assign_role: accept all roles; Admin/SuperAdmin gated to SuperAdmin -------
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

  if p_role_name not in ('Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin') then
    raise exception 'Unsupported role assignment';
  end if;

  -- Authorization: elevated roles require SuperAdmin; the rest require Admin.
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

  -- SuperAdmin implies Admin so RLS / Admin-gated UI treat them as Admin too.
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

grant execute on function public.admin_access_assign_role(uuid, text) to authenticated;

-- 6. remove_role: generic removal with gating + safety guards -----------------
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

  if p_role_name not in ('Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin') then
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

  -- Do not strip Admin from a SuperAdmin (would desync the implied-Admin rule).
  if p_role_name = 'Admin' and 'SuperAdmin' = any(v_prior_roles) then
    raise exception 'Remove SuperAdmin before removing Admin';
  end if;

  -- Never remove the last holder of Admin or SuperAdmin.
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

grant execute on function public.admin_access_remove_role(uuid, text) to authenticated;

-- 7. admin_access_list: expose is_super_admin and recompute the Admin
--    grant/revoke hints against SuperAdmin authority. -------------------------
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
      bool_or(r.name in ('Admin', 'SuperAdmin', 'LoanOfficer', 'Originator', 'Intern')) as is_internal,
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

grant execute on function public.admin_access_list(text, text, text) to authenticated;

-- Notify postgrest to reload the schema cache so the API sees the new functions.
NOTIFY pgrst, 'reload schema';
