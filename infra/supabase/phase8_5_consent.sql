-- POPIA / policy / T&C consent capture for loan applications.
-- Stores an immutable record of what the applicant (or staff on their behalf)
-- acknowledged, which version of the wording, and when — so consent is provable
-- under POPIA. Idempotent; safe to re-run.

create table if not exists public.application_consents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  consent_version text not null,
  items jsonb not null,                 -- [{ key, section, prompt, answer: true }]
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz not null default now(),
  user_agent text
);

create index if not exists idx_application_consents_application
  on public.application_consents (application_id);

alter table public.application_consents enable row level security;

-- Access follows the parent application: the owning client, or internal roles.
drop policy if exists "consents select" on public.application_consents;
create policy "consents select"
on public.application_consents
for select
to authenticated
using (
  exists (
    select 1 from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = application_consents.application_id
      and c.user_id = auth.uid()
  )
  or public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1 from public.loan_applications la
    where la.id = application_consents.application_id
      and la.assigned_to_user_id = auth.uid()
      and (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
  )
);

drop policy if exists "consents insert" on public.application_consents;
create policy "consents insert"
on public.application_consents
for insert
to authenticated
with check (
  exists (
    select 1 from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = application_consents.application_id
      and c.user_id = auth.uid()
  )
  or public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1 from public.loan_applications la
    where la.id = application_consents.application_id
      and la.assigned_to_user_id = auth.uid()
      and (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
  )
);

-- No update/delete policies: consent records are immutable by design.

NOTIFY pgrst, 'reload schema';
