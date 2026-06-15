-- Add Non-Financial Support table

create table if not exists public.non_financial_support (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  application_id uuid references public.loan_applications(id) on delete set null,
  advisor_user_id uuid not null references auth.users(id) on delete restrict,
  support_type text not null,
  duration_hours numeric(5,2) not null check (duration_hours > 0),
  date_provided date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_nfs_client on public.non_financial_support(client_id);
create index if not exists idx_nfs_advisor on public.non_financial_support(advisor_user_id);
create index if not exists idx_nfs_date on public.non_financial_support(date_provided);

-- Set up RLS for NFS
alter table public.non_financial_support enable row level security;

-- Drop existing policies if any to prevent errors on re-run
drop policy if exists "NFS readable by internals and clients" on public.non_financial_support;
drop policy if exists "NFS insertable by internals" on public.non_financial_support;
drop policy if exists "NFS updatable by internals" on public.non_financial_support;

create policy "NFS readable by internals and clients"
on public.non_financial_support for select
using (
  public.current_user_has_role('Intern') or
  public.current_user_has_role('Originator') or
  public.current_user_has_role('LoanOfficer') or
  public.current_user_has_role('Admin') or
  (
    public.current_user_has_role('Client') and
    client_id in (select id from public.clients where user_id = auth.uid())
  )
);

create policy "NFS insertable by internals"
on public.non_financial_support for insert
with check (
  public.current_user_has_role('Intern') or
  public.current_user_has_role('Originator') or
  public.current_user_has_role('LoanOfficer') or
  public.current_user_has_role('Admin')
);

create policy "NFS updatable by internals"
on public.non_financial_support for update
using (
  public.current_user_has_role('Intern') or
  public.current_user_has_role('Originator') or
  public.current_user_has_role('LoanOfficer') or
  public.current_user_has_role('Admin')
);
