create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  body text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create index if not exists idx_notes_application_id on public.notes(application_id);
create index if not exists idx_notes_created_at on public.notes(created_at);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notes'
      and policyname = 'notes read related'
  ) then
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
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notes'
      and policyname = 'notes insert related'
  ) then
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
  end if;
end $$;
