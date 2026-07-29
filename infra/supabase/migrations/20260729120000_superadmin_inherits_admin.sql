-- SuperAdmin is an Admin capability superset. Some accounts created before
-- role assignment began persisting both rows hold only SuperAdmin, while most
-- RLS policies check for Admin. Make the inheritance rule authoritative at
-- the database boundary so those accounts can read the same tenant data.
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

-- Repair legacy data as well, keeping direct role queries consistent with RLS.
insert into public.user_roles (user_id, role_id)
select superadmins.user_id, admin_role.id
from public.user_roles superadmins
join public.roles super_role on super_role.id = superadmins.role_id and super_role.name = 'SuperAdmin'
cross join public.roles admin_role
where admin_role.name = 'Admin'
on conflict do nothing;
