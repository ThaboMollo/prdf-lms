alter table public.loan_documents
  add column if not exists verification_note text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;

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

create index if not exists idx_document_requirements_status on public.document_requirements(required_at_status);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(user_id) where read_at is null;
create index if not exists idx_loan_documents_status on public.loan_documents(status);

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

alter table public.document_requirements enable row level security;
alter table public.notification_templates enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notifications enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='document_requirements' and policyname='doc requirements staff read write') then
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
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notification_templates' and policyname='notification templates staff read write') then
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
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='user preferences self read write') then
    create policy "user preferences self read write"
    on public.user_preferences
    for all
    to authenticated
    using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'))
    with check (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications self read') then
    create policy "notifications self read"
    on public.notifications
    for select
    to authenticated
    using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications self update read status') then
    create policy "notifications self update read status"
    on public.notifications
    for update
    to authenticated
    using (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'))
    with check (user_id = auth.uid() or public.is_in_role(auth.uid(), 'Admin'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications insert by service users') then
    create policy "notifications insert by service users"
    on public.notifications
    for insert
    to authenticated
    with check (auth.uid() is not null);
  end if;
end $$;

insert into public.notification_templates (type, channel, title_template, body_template, is_active)
values
  ('ApplicationStatusChanged', 'InApp', 'Application status updated', 'Your application status changed to {{status}}.', true),
  ('TaskReminder', 'InApp', 'Task reminder', 'You have an open task due soon.', true),
  ('ArrearsReminder', 'InApp', 'Repayment overdue', 'Your repayment is overdue. Please make payment as soon as possible.', true),
  ('StaleApplicationFollowUp', 'InApp', 'Application follow-up', 'This application requires follow-up.', true)
on conflict (type) do nothing;
