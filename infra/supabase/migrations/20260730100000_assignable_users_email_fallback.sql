-- list_assignable_users() only returned full_name, which is frequently null
-- (profiles.full_name is optional and several internal accounts never set
-- it). backend-node/src/users/users.service.ts's listAssignable() then fell
-- back to the raw user_id, so the "Assign to user" dropdown in admin-ui
-- showed UUIDs instead of a human-readable label. Add email to the
-- function's result so the app can fall back to that instead.
-- Return type is changing (new email column), which create or replace
-- cannot do for functions with OUT-parameter-defined row types.
drop function public.list_assignable_users();

create function public.list_assignable_users()
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
    u.email::text,
    array_agg(distinct r.name order by r.name) as roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.profiles p on p.user_id = ur.user_id
  join auth.users u on u.id = ur.user_id
  group by ur.user_id, p.full_name, u.email
  having bool_or(r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern'))
     and not bool_or(r.name = 'SuperAdmin')
  order by coalesce(p.full_name, u.email::text, ur.user_id::text);
end;
$$;

revoke all on function public.list_assignable_users() from public, anon;
grant execute on function public.list_assignable_users() to authenticated;
