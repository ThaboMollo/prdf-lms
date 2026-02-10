-- PRDF LMS Phase 1 schema (Postgres/Supabase)

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id bigint not null references public.roles(id) on delete restrict,
  primary key (user_id, role_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  business_name text not null,
  registration_no text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  requested_amount numeric(18,2) not null check (requested_amount > 0),
  term_months int not null check (term_months > 0),
  purpose text not null,
  status text not null default 'Draft',
  submitted_at timestamptz,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  status text not null default 'Pending',
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  note text
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  title text not null,
  status text not null default 'Open',
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  body text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id text not null,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.loan_applications(id) on delete restrict,
  principal_amount numeric(18,2) not null check (principal_amount > 0),
  interest_rate numeric(6,3) not null default 0 check (interest_rate >= 0),
  term_months int not null check (term_months > 0),
  status text not null default 'PendingDisbursement',
  disbursed_at timestamptz,
  outstanding_principal numeric(18,2) not null check (outstanding_principal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.disbursements (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  disbursed_at timestamptz not null default now(),
  disbursed_by uuid references auth.users(id) on delete set null,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  principal_component numeric(18,2) not null default 0 check (principal_component >= 0),
  interest_component numeric(18,2) not null default 0 check (interest_component >= 0),
  paid_at timestamptz not null default now(),
  payment_reference text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.repayment_schedule (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  installment_no int not null check (installment_no > 0),
  due_date date not null,
  due_principal numeric(18,2) not null default 0 check (due_principal >= 0),
  due_interest numeric(18,2) not null default 0 check (due_interest >= 0),
  due_total numeric(18,2) not null check (due_total >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'Pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (loan_id, installment_no)
);

create index if not exists idx_clients_user_id on public.clients(user_id);
create index if not exists idx_loan_applications_client_id on public.loan_applications(client_id);
create index if not exists idx_loan_applications_assigned on public.loan_applications(assigned_to_user_id);
create index if not exists idx_loan_documents_application_id on public.loan_documents(application_id);
create index if not exists idx_status_history_application_id on public.application_status_history(application_id);
create index if not exists idx_tasks_application_id on public.tasks(application_id);
create index if not exists idx_notes_application_id on public.notes(application_id);
create index if not exists idx_notes_created_at on public.notes(created_at);
create index if not exists idx_audit_log_actor on public.audit_log(actor_user_id);
create index if not exists idx_loans_application on public.loans(application_id);
create index if not exists idx_disbursements_loan on public.disbursements(loan_id);
create index if not exists idx_repayments_loan on public.repayments(loan_id);
create index if not exists idx_repayments_paid_at on public.repayments(paid_at);
create index if not exists idx_repayment_schedule_loan on public.repayment_schedule(loan_id);
create index if not exists idx_repayment_schedule_due_date on public.repayment_schedule(due_date);
