-- PRDF LMS — canonical baseline schema (Supabase CLI managed)
--
-- This replaces 18 hand-maintained "phase" patch files with one clean,
-- byte-identical-per-tenant baseline. It is the synthesized FINAL state of
-- those patches, not a concatenation — where a later patch redefined or
-- dropped something from an earlier one, only the final winner appears here.
-- See platform-architecture-design.md §3.1 and docs/architecture.md for the
-- rationale (every client runs this exact schema; client differences live in
-- data/config, never in schema drift).
--
-- Two deliberate corrections made while squashing (both reviewed, not
-- silent):
--   1. Non-Financial Support RLS policies referenced a function,
--      current_user_has_role(), that was never defined anywhere in the old
--      patch chain — those 3 policies would fail at creation time on a fresh
--      database. Fixed here to use is_in_role(), the pattern every other
--      policy in this file follows.
--   2. loans, disbursements, repayments and repayment_schedule had zero RLS
--      policies anywhere in the old chain. New policies are added below,
--      modelled on the existing loan_applications / loan_documents pattern:
--      staff-wide access for Admin/LoanOfficer, assignment-scoped access for
--      Intern/Originator, read-only access for the owning client, no client
--      writes (matches current application behaviour — clients never mutate
--      loan-servicing rows anywhere in the product).
--
-- Seed data (role catalogue, notification templates) lives separately in
-- infra/supabase/seed/seed.sql, run after this migration.

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. Tables
-- =============================================================================

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
  province text check (province is null or province in (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
  )),
  spatial_type text check (spatial_type is null or spatial_type in ('Rural', 'Township', 'City')),
  employment_status text,
  industry text,
  gender text,
  is_hdp boolean default false,
  is_disabled boolean default false,
  is_rural boolean default false,
  is_black_women_owned boolean default false,
  sa_citizenship_percentage numeric,
  is_director_operational boolean default false,
  cipc_registered boolean default false,
  sars_tax_pin text,
  insolvent_or_debt_review boolean default false,
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
  created_at timestamptz not null default now(),
  -- Resumable draft-wizard support (origin: phase9_draft_applications.sql).
  monthly_revenue numeric,
  years_in_operation integer,
  number_of_employees integer,
  bank_name text,
  current_step smallint not null default 1,
  last_saved_at timestamptz,
  -- HYBRID storage: normalized columns above are the source of truth;
  -- draft_state carries the exact wizard UI state for pixel-perfect
  -- restoration. Cleared on submit.
  draft_state jsonb,
  -- PRDF product limits (R250 000 – R5m, 1 – 60 months). Drafts are exempt:
  -- the apply wizard autosaves partial rows; the checks bite on submit when
  -- the row leaves Draft. Keep in sync with client-ui/src/lib/loanLimits.ts.
  -- (VALID, not NOT VALID — a fresh baseline has no legacy out-of-range rows,
  -- so the two are functionally identical here; VALID matches what's
  -- actually running in the current production lineage.)
  constraint loan_applications_requested_amount_range
    check (status = 'Draft' or (requested_amount >= 250000 and requested_amount <= 5000000)),
  constraint loan_applications_term_months_range
    check (status = 'Draft' or (term_months >= 1 and term_months <= 60))
);

-- One active draft per client (origin: phase9_draft_applications.sql).
create unique index if not exists uniq_active_draft_per_client
  on public.loan_applications (client_id)
  where status = 'Draft';

create table if not exists public.application_consents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  consent_version text not null,
  items jsonb not null,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz not null default now(),
  user_agent text
);

create index if not exists idx_application_consents_application
  on public.application_consents (application_id);

create table if not exists public.loan_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  status text not null default 'Pending',
  verification_note text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
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

create table if not exists public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  loan_product_id uuid references public.loan_products(id) on delete cascade,
  required_at_status text not null,
  doc_type text not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (loan_product_id, required_at_status, doc_type)
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null unique,
  channel text not null default 'InApp',
  title_template text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'InApp',
  type text not null,
  title text not null,
  message text not null,
  status text not null default 'Sent',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz
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

-- =============================================================================
-- 2. Indexes
-- =============================================================================

create index if not exists idx_clients_user_id on public.clients(user_id);
create index if not exists idx_loan_applications_client_id on public.loan_applications(client_id);
create index if not exists idx_loan_applications_assigned on public.loan_applications(assigned_to_user_id);
create index if not exists idx_loan_documents_application_id on public.loan_documents(application_id);
create index if not exists idx_loan_documents_status on public.loan_documents(status);
create index if not exists idx_status_history_application_id on public.application_status_history(application_id);
create index if not exists idx_tasks_application_id on public.tasks(application_id);
create index if not exists idx_notes_application_id on public.notes(application_id);
create index if not exists idx_notes_created_at on public.notes(created_at);
create index if not exists idx_document_requirements_status on public.document_requirements(required_at_status);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(user_id) where read_at is null;
create index if not exists idx_audit_log_actor on public.audit_log(actor_user_id);
create index if not exists idx_loans_application on public.loans(application_id);
create index if not exists idx_disbursements_loan on public.disbursements(loan_id);
create index if not exists idx_repayments_loan on public.repayments(loan_id);
create index if not exists idx_repayments_paid_at on public.repayments(paid_at);
create index if not exists idx_repayment_schedule_loan on public.repayment_schedule(loan_id);
create index if not exists idx_repayment_schedule_due_date on public.repayment_schedule(due_date);
create index if not exists idx_nfs_client on public.non_financial_support(client_id);
create index if not exists idx_nfs_advisor on public.non_financial_support(advisor_user_id);
create index if not exists idx_nfs_date on public.non_financial_support(date_provided);

-- =============================================================================
-- 3. Functions and triggers
-- =============================================================================

-- RBAC: roles are always re-derived from user_roles/roles at query time, never
-- trusted from JWT claims. Every RLS policy and both application backends
-- rely on this.
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

-- Caller's own roles, exposed to the frontend so its guards agree with what
-- RLS will actually allow.
create or replace function public.get_my_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;

grant execute on function public.get_my_roles() to authenticated;

-- Every new signup gets the baseline Client role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_role_id bigint;
begin
  select id into v_client_role_id from public.roles where name = 'Client' limit 1;
  if v_client_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, v_client_role_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Document rows are immutable after insert; only verification metadata may
-- change post-upload.
create or replace function public.prevent_immutable_document_changes()
returns trigger
language plpgsql
as $$
begin
  if old.application_id <> new.application_id
     or old.doc_type <> new.doc_type
     or old.storage_path <> new.storage_path
     or old.uploaded_by <> new.uploaded_by
     or old.uploaded_at <> new.uploaded_at then
    raise exception 'Immutable loan_documents fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_immutable_document_changes on public.loan_documents;
create trigger trg_prevent_immutable_document_changes
before update on public.loan_documents
for each row
execute function public.prevent_immutable_document_changes();

-- Authoritative submission gate: all 10 document types must be present before
-- an application can move into Submitted. Fires regardless of actor.
-- SECURITY DEFINER so the check is never filtered by the caller's own RLS.
-- Required types mirror client-ui/src/lib/requirements.ts and
-- client-ui/src/pages/ApplyPage.tsx DOC_SLOTS — keep in sync.
create or replace function public.enforce_required_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  missing text[];
begin
  if new.status = 'Submitted' and old.status is distinct from 'Submitted' then
    select coalesce(array_agg(required.doc_type), '{}') into missing
    from unnest(array[
      'IDDocument',
      'ProofOfAddress',
      'BusinessRegistration',
      'TaxClearance',
      'BankStatement',
      'Financials',
      'VendorQuotation',
      'RfqSupplierSpec',
      'PurchaseOrder',
      'TradeReference'
    ]) as required(doc_type)
    where not exists (
      select 1 from public.loan_documents d
      where d.application_id = new.id and d.doc_type = required.doc_type
    );

    if array_length(missing, 1) > 0 then
      raise exception 'Cannot submit application: missing required document(s): %', array_to_string(missing, ', ');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_required_documents on public.loan_applications;
create trigger trg_enforce_required_documents
  before update of status on public.loan_applications
  for each row
  execute function public.enforce_required_documents();

-- 30-day draft retention. Child rows (documents, consents, status history)
-- cascade via their FKs. Scheduled below via pg_cron if available.
create or replace function public.purge_stale_drafts() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.loan_applications
  where status = 'Draft'
    and coalesce(last_saved_at, created_at) < now() - interval '30 days';
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purge-stale-drafts') then
      perform cron.unschedule('purge-stale-drafts');
    end if;
    perform cron.schedule('purge-stale-drafts', '0 3 * * *',
      $cron$select public.purge_stale_drafts()$cron$);
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;

-- Admin access management. Elevated roles (Admin, SuperAdmin) may only be
-- granted/revoked by a SuperAdmin; everything else requires Admin or above.
-- SuperAdmin implies Admin. Guards prevent removing your own elevated access
-- or removing the last remaining Admin/SuperAdmin.
create or replace function public.admin_access_assign_role(
  p_target_user_id uuid,
  p_role_name text
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
  v_target_exists boolean := false;
  v_role_id bigint;
  v_admin_role_id bigint;
  v_target_email text;
  v_target_full_name text;
  v_prior_roles text[] := '{}'::text[];
  v_result_roles text[] := '{}'::text[];
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_role_name not in ('Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin') then
    raise exception 'Unsupported role assignment';
  end if;

  if p_role_name in ('Admin', 'SuperAdmin') then
    if not public.is_in_role(v_actor_user_id, 'SuperAdmin') then
      raise exception 'SuperAdmin role required to assign Admin or SuperAdmin';
    end if;
  elsif not (public.is_in_role(v_actor_user_id, 'Admin') or public.is_in_role(v_actor_user_id, 'SuperAdmin')) then
    raise exception 'Admin role required';
  end if;

  select exists (select 1 from auth.users u where u.id = p_target_user_id)
  into v_target_exists;
  if not v_target_exists then
    raise exception 'Target user does not exist';
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_prior_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  select r.id into v_role_id from public.roles r where r.name = p_role_name limit 1;
  if v_role_id is null then
    raise exception 'Role is not configured';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (p_target_user_id, v_role_id)
  on conflict do nothing;

  if p_role_name = 'SuperAdmin' then
    select r.id into v_admin_role_id from public.roles r where r.name = 'Admin' limit 1;
    if v_admin_role_id is not null then
      insert into public.user_roles (user_id, role_id)
      values (p_target_user_id, v_admin_role_id)
      on conflict do nothing;
    end if;
  end if;

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
    'UserAccess', p_target_user_id::text, 'RoleGranted', v_actor_user_id,
    jsonb_build_object(
      'source', 'admin-ui', 'assignedRole', p_role_name,
      'targetEmail', v_target_email, 'targetFullName', v_target_full_name,
      'priorRoles', v_prior_roles, 'resultingRoles', v_result_roles
    )
  );

  return query
  select p_target_user_id, v_result_roles, ('Admin' = any(v_result_roles));
end;
$$;

grant execute on function public.admin_access_assign_role(uuid, text) to authenticated;

create or replace function public.admin_access_remove_role(
  p_target_user_id uuid,
  p_role_name text
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
  v_role_id bigint;
  v_target_email text;
  v_target_full_name text;
  v_prior_roles text[] := '{}'::text[];
  v_result_roles text[] := '{}'::text[];
  v_role_holder_count integer := 0;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_role_name not in ('Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin') then
    raise exception 'Unsupported role';
  end if;

  if p_role_name in ('Admin', 'SuperAdmin') then
    if not public.is_in_role(v_actor_user_id, 'SuperAdmin') then
      raise exception 'SuperAdmin role required to revoke Admin or SuperAdmin';
    end if;
    if p_target_user_id = v_actor_user_id then
      raise exception 'You cannot revoke your own % access', p_role_name;
    end if;
  elsif not (public.is_in_role(v_actor_user_id, 'Admin') or public.is_in_role(v_actor_user_id, 'SuperAdmin')) then
    raise exception 'Admin role required';
  end if;

  select coalesce(array_agg(distinct r.name order by r.name), '{}'::text[])
  into v_prior_roles
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  if p_role_name = 'Admin' and 'SuperAdmin' = any(v_prior_roles) then
    raise exception 'Remove SuperAdmin before removing Admin';
  end if;

  if p_role_name in ('Admin', 'SuperAdmin') and p_role_name = any(v_prior_roles) then
    select count(distinct ur.user_id)
    into v_role_holder_count
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = p_role_name;
    if v_role_holder_count <= 1 then
      raise exception 'Cannot remove the last remaining %', p_role_name;
    end if;
  end if;

  select r.id into v_role_id from public.roles r where r.name = p_role_name limit 1;
  if v_role_id is null then
    raise exception 'Role is not configured';
  end if;

  delete from public.user_roles ur
  where ur.user_id = p_target_user_id and ur.role_id = v_role_id;

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
    'UserAccess', p_target_user_id::text, 'RoleRevoked', v_actor_user_id,
    jsonb_build_object(
      'source', 'admin-ui', 'revokedRole', p_role_name,
      'targetEmail', v_target_email, 'targetFullName', v_target_full_name,
      'priorRoles', v_prior_roles, 'resultingRoles', v_result_roles
    )
  );

  return query
  select p_target_user_id, v_result_roles, ('Admin' = any(v_result_roles));
end;
$$;

grant execute on function public.admin_access_remove_role(uuid, text) to authenticated;

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
  is_super_admin boolean,
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
  v_actor_is_super boolean := false;
  v_admin_count integer := 0;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (public.is_in_role(v_actor_user_id, 'Admin') or public.is_in_role(v_actor_user_id, 'SuperAdmin')) then
    raise exception 'Admin role required';
  end if;

  if p_filter not in ('all', 'internal', 'clients', 'admins', 'non-admins') then
    raise exception 'Invalid filter value';
  end if;

  v_actor_is_super := public.is_in_role(v_actor_user_id, 'SuperAdmin');

  select count(distinct ur.user_id)
  into v_admin_count
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where r.name = 'Admin';

  return query
  with role_agg as (
    select
      u.id as user_id,
      p.full_name,
      u.email,
      array_agg(distinct r.name order by r.name) filter (where r.name is not null) as roles,
      bool_or(r.name = 'Admin') as is_admin,
      bool_or(r.name = 'SuperAdmin') as is_super_admin,
      bool_or(r.name in ('Admin', 'SuperAdmin', 'LoanOfficer', 'Originator', 'Intern')) as is_internal,
      bool_or(r.name = 'Client') as is_client
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    left join public.roles r on r.id = ur.role_id
    group by u.id, p.full_name, u.email
  ),
  filtered as (
    select
      ra.user_id, ra.full_name, ra.email,
      coalesce(ra.roles, '{}'::text[]) as roles,
      coalesce(ra.is_admin, false) as is_admin,
      coalesce(ra.is_super_admin, false) as is_super_admin,
      coalesce(ra.is_internal, false) as is_internal
    from role_agg ra
    where (
        p_search is null
        or coalesce(ra.full_name, '') ilike '%' || p_search || '%'
        or coalesce(ra.email, '') ilike '%' || p_search || '%'
      )
      and (p_role is null or p_role = any(ra.roles))
      and (
        p_filter = 'all'
        or (p_filter = 'internal' and ra.is_internal)
        or (p_filter = 'clients' and not ra.is_internal)
        or (p_filter = 'admins' and ra.is_admin)
        or (p_filter = 'non-admins' and ra.is_internal and not ra.is_admin)
      )
  )
  select
    f.user_id, f.full_name::text, f.email::text, f.roles,
    f.is_admin, f.is_super_admin, f.is_internal,
    (v_actor_is_super and not f.is_admin) as can_grant_admin,
    (v_actor_is_super and f.is_admin and f.user_id <> v_actor_user_id and v_admin_count > 1) as can_revoke_admin,
    case
      when not v_actor_is_super then 'Only a SuperAdmin can grant Admin access.'
      when f.is_admin then 'User already has Admin access.'
      else null
    end as grant_disabled_reason,
    case
      when not v_actor_is_super then 'Only a SuperAdmin can revoke Admin access.'
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

-- =============================================================================
-- 4. Row-level security
-- =============================================================================
-- roles table remains readable without RLS, by design (role catalogue only,
-- no tenant-sensitive data).

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.clients enable row level security;
alter table public.loan_products enable row level security;
alter table public.loan_applications enable row level security;
alter table public.application_consents enable row level security;
alter table public.loan_documents enable row level security;
alter table public.application_status_history enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.document_requirements enable row level security;
alter table public.notification_templates enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;
alter table public.non_financial_support enable row level security;
alter table public.loans enable row level security;
alter table public.disbursements enable row level security;
alter table public.repayments enable row level security;
alter table public.repayment_schedule enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "profiles self upsert" on public.profiles;
create policy "profiles self upsert"
on public.profiles
for all
to authenticated
using (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'))
with check (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "user roles self read" on public.user_roles;
create policy "user roles self read"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id or public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "clients own read write" on public.clients;
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

drop policy if exists "loan products read all" on public.loan_products;
create policy "loan products read all"
on public.loan_products
for select
to authenticated
using (true);

drop policy if exists "applications client access" on public.loan_applications;
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

drop policy if exists "applications client create" on public.loan_applications;
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

drop policy if exists "applications update by role" on public.loan_applications;
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

drop policy if exists "applications update by client" on public.loan_applications;
create policy "applications update by client"
on public.loan_applications
for update
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = loan_applications.client_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = loan_applications.client_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "applications delete own draft" on public.loan_applications;
create policy "applications delete own draft"
on public.loan_applications
for delete
to authenticated
using (
  status = 'Draft'
  and exists (
    select 1 from public.clients c
    where c.id = loan_applications.client_id
      and c.user_id = auth.uid()
  )
);

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

drop policy if exists "documents read by related role" on public.loan_documents;
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

drop policy if exists "documents insert by client" on public.loan_documents;
create policy "documents insert by client"
on public.loan_documents
for insert
to authenticated
with check (
  exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = loan_documents.application_id
      and c.user_id = auth.uid()
  )
  or public.is_in_role(auth.uid(), 'Admin')
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

drop policy if exists "documents update by staff" on public.loan_documents;
create policy "documents update by staff"
on public.loan_documents
for update
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

drop policy if exists "documents delete by client on draft" on public.loan_documents;
create policy "documents delete by client on draft"
on public.loan_documents
for delete
to authenticated
using (
  exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = loan_documents.application_id
      and c.user_id = auth.uid()
      and la.status = 'Draft'
  )
);

drop policy if exists "status history readable by related" on public.application_status_history;
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

drop policy if exists "status history write by staff" on public.application_status_history;
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

drop policy if exists "status history write by client" on public.application_status_history;
create policy "status history write by client"
on public.application_status_history
for insert
to authenticated
with check (
  exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = application_status_history.application_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "tasks read related" on public.tasks;
create policy "tasks read related"
on public.tasks
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or assigned_to = auth.uid()
);

drop policy if exists "tasks write by staff" on public.tasks;
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

drop policy if exists "notes read related" on public.notes;
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

drop policy if exists "notes insert related" on public.notes;
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

drop policy if exists "doc requirements staff read write" on public.document_requirements;
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

drop policy if exists "notification templates staff read write" on public.notification_templates;
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

drop policy if exists "user preferences self read write" on public.user_preferences;
create policy "user preferences self read write"
on public.user_preferences
for all
to authenticated
using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'))
with check (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "notifications self read" on public.notifications;
create policy "notifications self read"
on public.notifications
for select
to authenticated
using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "notifications self update read status" on public.notifications;
create policy "notifications self update read status"
on public.notifications
for update
to authenticated
using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'))
with check (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "notifications insert by service users" on public.notifications;
create policy "notifications insert by service users"
on public.notifications
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "audit log admin read" on public.audit_log;
create policy "audit log admin read"
on public.audit_log
for select
to authenticated
using (public.is_in_role(auth.uid(), 'Admin'));

drop policy if exists "audit log insert service" on public.audit_log;
create policy "audit log insert service"
on public.audit_log
for insert
to authenticated
with check (auth.uid() is not null);

-- Non-Financial Support. Fixes a defect in the old patch chain: the original
-- policies referenced current_user_has_role(), a function that was never
-- defined anywhere, so they would fail at creation time. Rewritten to use
-- is_in_role(), matching every other policy in this file.
drop policy if exists "NFS readable by internals and clients" on public.non_financial_support;
create policy "NFS readable by internals and clients"
on public.non_financial_support
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Intern')
  or public.is_in_role(auth.uid(), 'Originator')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or public.is_in_role(auth.uid(), 'Admin')
  or (
    public.is_in_role(auth.uid(), 'Client')
    and client_id in (select id from public.clients where user_id = auth.uid())
  )
);

drop policy if exists "NFS insertable by internals" on public.non_financial_support;
create policy "NFS insertable by internals"
on public.non_financial_support
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Intern')
  or public.is_in_role(auth.uid(), 'Originator')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or public.is_in_role(auth.uid(), 'Admin')
);

drop policy if exists "NFS updatable by internals" on public.non_financial_support;
create policy "NFS updatable by internals"
on public.non_financial_support
for update
to authenticated
using (
  public.is_in_role(auth.uid(), 'Intern')
  or public.is_in_role(auth.uid(), 'Originator')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or public.is_in_role(auth.uid(), 'Admin')
);

-- Loan servicing (loans, disbursements, repayments, repayment_schedule).
-- NEW: these four tables had zero RLS policies anywhere in the old patch
-- chain — a real gap not mentioned in platform-architecture-design.md, closed
-- here. Pattern mirrors loan_applications/loan_documents: Admin/LoanOfficer
-- see everything, an assigned Intern/Originator sees/writes what's assigned
-- to them, the owning client can read but never write (matches current
-- application behaviour — no client-facing mutation of loan-servicing data
-- exists anywhere in the product today).

drop policy if exists "loans select by related role" on public.loans;
create policy "loans select by related role"
on public.loans
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = loans.application_id
      and (c.user_id = auth.uid() or la.assigned_to_user_id = auth.uid())
  )
);

drop policy if exists "loans insert by staff" on public.loans;
create policy "loans insert by staff"
on public.loans
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1 from public.loan_applications la
      where la.id = loans.application_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

drop policy if exists "loans update by staff" on public.loans;
create policy "loans update by staff"
on public.loans
for update
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1 from public.loan_applications la
      where la.id = loans.application_id
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
      where la.id = loans.application_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

drop policy if exists "disbursements select by related role" on public.disbursements;
create policy "disbursements select by related role"
on public.disbursements
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loans l
    join public.loan_applications la on la.id = l.application_id
    join public.clients c on c.id = la.client_id
    where l.id = disbursements.loan_id
      and (c.user_id = auth.uid() or la.assigned_to_user_id = auth.uid())
  )
);

drop policy if exists "disbursements insert by staff" on public.disbursements;
create policy "disbursements insert by staff"
on public.disbursements
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1
      from public.loans l
      join public.loan_applications la on la.id = l.application_id
      where l.id = disbursements.loan_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

drop policy if exists "repayments select by related role" on public.repayments;
create policy "repayments select by related role"
on public.repayments
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loans l
    join public.loan_applications la on la.id = l.application_id
    join public.clients c on c.id = la.client_id
    where l.id = repayments.loan_id
      and (c.user_id = auth.uid() or la.assigned_to_user_id = auth.uid())
  )
);

drop policy if exists "repayments insert by staff" on public.repayments;
create policy "repayments insert by staff"
on public.repayments
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1
      from public.loans l
      join public.loan_applications la on la.id = l.application_id
      where l.id = repayments.loan_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

drop policy if exists "repayment schedule select by related role" on public.repayment_schedule;
create policy "repayment schedule select by related role"
on public.repayment_schedule
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loans l
    join public.loan_applications la on la.id = l.application_id
    join public.clients c on c.id = la.client_id
    where l.id = repayment_schedule.loan_id
      and (c.user_id = auth.uid() or la.assigned_to_user_id = auth.uid())
  )
);

drop policy if exists "repayment schedule insert by staff" on public.repayment_schedule;
create policy "repayment schedule insert by staff"
on public.repayment_schedule
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1
      from public.loans l
      join public.loan_applications la on la.id = l.application_id
      where l.id = repayment_schedule.loan_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

drop policy if exists "repayment schedule update by staff" on public.repayment_schedule;
create policy "repayment schedule update by staff"
on public.repayment_schedule
for update
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
    and exists (
      select 1
      from public.loans l
      join public.loan_applications la on la.id = l.application_id
      where l.id = repayment_schedule.loan_id
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
      select 1
      from public.loans l
      join public.loan_applications la on la.id = l.application_id
      where l.id = repayment_schedule.loan_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

-- =============================================================================
-- 5. Storage (loan-documents bucket)
-- =============================================================================
-- Object path shape: applications/{application_id}/{uuid}-{filename}.
-- The bucket itself is provisioned outside migrations (Supabase dashboard /
-- provisioning script) — see infra/scripts/provision-tenant.ts (Phase 5) for
-- file_size_limit and allowed_mime_types, which must be set per tenant.

drop policy if exists "loan documents upload by owner" on storage.objects;
create policy "loan documents upload by owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'loan-documents'
  and (
    public.is_in_role(auth.uid(), 'Admin')
    or public.is_in_role(auth.uid(), 'LoanOfficer')
    or exists (
      select 1
      from public.loan_applications la
      join public.clients c on c.id = la.client_id
      where la.id::text = split_part(name, '/', 2)
        and c.user_id = auth.uid()
    )
    or (
      (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
      and exists (
        select 1 from public.loan_applications la
        where la.id::text = split_part(name, '/', 2)
          and la.assigned_to_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "loan documents read by owner" on storage.objects;
create policy "loan documents read by owner"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'loan-documents'
  and (
    public.is_in_role(auth.uid(), 'Admin')
    or public.is_in_role(auth.uid(), 'LoanOfficer')
    or exists (
      select 1
      from public.loan_applications la
      join public.clients c on c.id = la.client_id
      where la.id::text = split_part(name, '/', 2)
        and c.user_id = auth.uid()
    )
    or (
      (public.is_in_role(auth.uid(), 'Intern') or public.is_in_role(auth.uid(), 'Originator'))
      and exists (
        select 1 from public.loan_applications la
        where la.id::text = split_part(name, '/', 2)
          and la.assigned_to_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "loan documents delete by owner on draft" on storage.objects;
create policy "loan documents delete by owner on draft"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'loan-documents'
  and exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id::text = split_part(name, '/', 2)
      and c.user_id = auth.uid()
      and la.status = 'Draft'
  )
);

NOTIFY pgrst, 'reload schema';
