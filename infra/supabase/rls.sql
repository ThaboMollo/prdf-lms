-- PRDF LMS Phase 1 RLS and RBAC helpers

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
      and r.name = p_role_name
  );
$$;

grant execute on function public.is_in_role(uuid, text) to anon, authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.clients enable row level security;
alter table public.loan_products enable row level security;
alter table public.loan_applications enable row level security;
alter table public.loan_documents enable row level security;
alter table public.application_status_history enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.document_requirements enable row level security;
alter table public.notification_templates enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- roles table remains readable without RLS, per plan

create policy "profiles self read"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'));

create policy "profiles self upsert"
on public.profiles
for all
to authenticated
using (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'))
with check (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'));

create policy "user roles self read"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'));

create policy "clients own read write"
on public.clients
for all
to authenticated
using (
  user_id = auth.uid()
  or public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
)
with check (
  user_id = auth.uid()
  or public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
);

create policy "loan products read all"
on public.loan_products
for select
to authenticated
using (true);

create policy "applications client access"
on public.loan_applications
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = loan_applications.client_id
      and c.user_id = auth.uid()
  )
  or public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and loan_applications.assigned_to_user_id = auth.uid()
  )
);

create policy "applications client create"
on public.loan_applications
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = loan_applications.client_id
      and c.user_id = auth.uid()
  )
  or public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and loan_applications.assigned_to_user_id = auth.uid()
  )
);

create policy "applications update by role"
on public.loan_applications
for update
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and loan_applications.assigned_to_user_id = auth.uid()
  )
)
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and loan_applications.assigned_to_user_id = auth.uid()
  )
);

create policy "documents read by related role"
on public.loan_documents
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = loan_documents.application_id
      and (
        c.user_id = auth.uid()
        or la.assigned_to_user_id = auth.uid()
      )
  )
);

create policy "documents write by staff"
on public.loan_documents
for all
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1 from public.loan_applications la
      where la.id = loan_documents.application_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
)
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1 from public.loan_applications la
      where la.id = loan_documents.application_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

create policy "status history readable by related"
on public.application_status_history
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = application_status_history.application_id
      and (c.user_id = auth.uid() or la.assigned_to_user_id = auth.uid())
  )
);

create policy "status history write by staff"
on public.application_status_history
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or public.is_in_role(auth.uid(), 'Intern')
  or public.is_in_role(auth.uid(), 'Originator')
);

create policy "tasks read related"
on public.tasks
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or assigned_to = auth.uid()
);

create policy "tasks write by staff"
on public.tasks
for all
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or assigned_to = auth.uid()
)
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or assigned_to = auth.uid()
);

create policy "notes read related"
on public.notes
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = notes.application_id
      and (c.user_id = auth.uid() or la.assigned_to_user_id = auth.uid())
  )
);

create policy "notes insert related"
on public.notes
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or public.is_in_role(auth.uid(), 'Intern')
  or public.is_in_role(auth.uid(), 'Originator')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = notes.application_id
      and c.user_id = auth.uid()
  )
);

create policy "doc requirements staff read write"
on public.document_requirements
for all
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
)
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
);

create policy "notification templates staff read write"
on public.notification_templates
for all
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
)
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
);

create policy "user preferences self read write"
on public.user_preferences
for all
to authenticated
using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'))
with check (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));

create policy "notifications self read"
on public.notifications
for select
to authenticated
using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));

create policy "notifications self update read status"
on public.notifications
for update
to authenticated
using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'))
with check (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));

create policy "notifications insert by service users"
on public.notifications
for insert
to authenticated
with check (auth.uid() is not null);

create policy "audit log admin read"
on public.audit_log
for select
to authenticated
using (public.is_in_role(auth.uid(), 'Admin'));

create policy "audit log insert service"
on public.audit_log
for insert
to authenticated
with check (auth.uid() is not null);
