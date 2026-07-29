-- SuperAdmin is the hidden platform-owner capability and sits above Admin.
-- It is not a grantable application role and must not require a duplicate
-- Admin row. RLS still needs to honour its inherited Admin capabilities.
create or replace function public.is_in_role(p_user_id uuid, p_role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and (
        r.name = p_role_name
        or (p_role_name = 'Admin' and r.name = 'SuperAdmin')
      )
  );
$$;

grant execute on function public.is_in_role(uuid, text) to anon, authenticated, service_role;
