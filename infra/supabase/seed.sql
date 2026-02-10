insert into public.roles (name)
values ('Admin'), ('LoanOfficer'), ('Intern'), ('Originator'), ('Client')
on conflict (name) do nothing;
