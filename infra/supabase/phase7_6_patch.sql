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
  v_admin_count integer := 0;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_in_role(v_actor_user_id, 'Admin') then
    raise exception 'Admin role required';
  end if;

  if p_filter not in ('all', 'admins', 'non-admins') then
    raise exception 'Invalid filter value';
  end if;

  select count(distinct ur.user_id)
  into v_admin_count
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where r.name = 'Admin';

  return query
  with role_agg as (
    select
      ur.user_id,
      array_agg(distinct r.name order by r.name) as roles,
      bool_or(r.name = 'Admin') as is_admin,
      bool_or(r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern')) as is_internal
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    group by ur.user_id
  ),
  filtered as (
    select
      ra.user_id,
      p.full_name,
      u.email,
      ra.roles,
      ra.is_admin,
      ra.is_internal
    from role_agg ra
    left join public.profiles p on p.user_id = ra.user_id
    left join auth.users u on u.id = ra.user_id
    where ra.is_internal
      and (
        p_search is null
        or coalesce(p.full_name, '') ilike '%' || p_search || '%'
        or coalesce(u.email, '') ilike '%' || p_search || '%'
      )
      and (p_role is null or p_role = any(ra.roles))
      and (
        p_filter = 'all'
        or (p_filter = 'admins' and ra.is_admin)
        or (p_filter = 'non-admins' and not ra.is_admin)
      )
  )
  select
    f.user_id,
    f.full_name::text,
    f.email::text,
    f.roles,
    f.is_admin,
    f.is_internal,
    (f.is_internal and not f.is_admin) as can_grant_admin,
    (f.is_admin and f.user_id <> v_actor_user_id and v_admin_count > 1) as can_revoke_admin,
    case
      when f.is_admin then 'User already has Admin access.'
      when not f.is_internal then 'Client-only users are not eligible for Admin access.'
      else null
    end as grant_disabled_reason,
    case
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

create or replace function public.admin_access_grant(
  p_target_user_id uuid
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
  v_admin_role_id bigint;
  v_target_exists boolean := false;
  v_target_is_internal boolean := false;
  v_target_email text;
  v_target_full_name text;
  v_prior_roles text[] := '{}'::text[];
  v_result_roles text[] := '{}'::text[];
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_in_role(v_actor_user_id, 'Admin') then
    raise exception 'Admin role required';
  end if;

  select exists (
    select 1 from auth.users u where u.id = p_target_user_id
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception 'Target user does not exist';
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_prior_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_target_user_id
      and r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern')
  )
  into v_target_is_internal;

  if not v_target_is_internal then
    raise exception 'Target user is not an internal user';
  end if;

  select r.id
  into v_admin_role_id
  from public.roles r
  where r.name = 'Admin'
  limit 1;

  if v_admin_role_id is null then
    raise exception 'Admin role is not configured';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (p_target_user_id, v_admin_role_id)
  on conflict do nothing;

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
    'UserAccess',
    p_target_user_id::text,
    'AdminGranted',
    v_actor_user_id,
    jsonb_build_object(
      'source', 'admin-ui',
      'targetEmail', v_target_email,
      'targetFullName', v_target_full_name,
      'priorRoles', v_prior_roles,
      'resultingRoles', v_result_roles
    )
  );

  return query
  select
    p_target_user_id as user_id,
    v_result_roles as roles,
    ('Admin' = any(v_result_roles)) as is_admin;
end;
$$;

grant execute on function public.admin_access_grant(uuid) to authenticated;

create or replace function public.admin_access_revoke(
  p_target_user_id uuid
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
  v_admin_role_id bigint;
  v_target_exists boolean := false;
  v_target_email text;
  v_target_full_name text;
  v_admin_count integer := 0;
  v_prior_roles text[] := '{}'::text[];
  v_result_roles text[] := '{}'::text[];
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_in_role(v_actor_user_id, 'Admin') then
    raise exception 'Admin role required';
  end if;

  if p_target_user_id = v_actor_user_id then
    raise exception 'You cannot revoke your own Admin access';
  end if;

  select exists (
    select 1 from auth.users u where u.id = p_target_user_id
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception 'Target user does not exist';
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_prior_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  if 'Admin' = any(v_prior_roles) then
    select count(distinct ur.user_id)
    into v_admin_count
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'Admin';

    if v_admin_count <= 1 then
      raise exception 'Cannot revoke the last remaining Admin';
    end if;
  end if;

  select r.id
  into v_admin_role_id
  from public.roles r
  where r.name = 'Admin'
  limit 1;

  if v_admin_role_id is null then
    raise exception 'Admin role is not configured';
  end if;

  delete from public.user_roles ur
  where ur.user_id = p_target_user_id
    and ur.role_id = v_admin_role_id;

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
    'UserAccess',
    p_target_user_id::text,
    'AdminRevoked',
    v_actor_user_id,
    jsonb_build_object(
      'source', 'admin-ui',
      'targetEmail', v_target_email,
      'targetFullName', v_target_full_name,
      'priorRoles', v_prior_roles,
      'resultingRoles', v_result_roles
    )
  );

  return query
  select
    p_target_user_id as user_id,
    v_result_roles as roles,
    ('Admin' = any(v_result_roles)) as is_admin;
end;
$$;

grant execute on function public.admin_access_revoke(uuid) to authenticated;
