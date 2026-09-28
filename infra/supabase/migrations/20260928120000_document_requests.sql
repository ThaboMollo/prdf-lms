-- Admin-initiated document requests.
--
-- Until now the only way to ask an applicant for a missing document was to move
-- the application to InfoRequested with a free-text note. That note is not
-- actionable: it names nothing the portal can render an upload slot for, so the
-- applicant has to work out which of the ten checklist types was meant — or
-- upload something that was never asked for.
--
-- document_requirements does not solve this either. It is product-level
-- configuration ("every application needs a CIPC certificate"), shared by every
-- case and edited only by management. A request is per-application, raised by
-- the reviewer looking at one case, and may be for a document that is on no
-- checklist at all (doc_type = 'Other' plus a name the reviewer types).
--
-- Additive: nothing existing reads or writes this table, and an application with
-- no requests behaves exactly as before.

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,

  -- A key from the checklist (IDDocument, TaxClearance, …) or the literal
  -- 'Other'. Deliberately not a foreign key to document_requirements: a
  -- reviewer may ask for a type that is not required for this product, and the
  -- requirement row could be deleted afterwards without invalidating the ask.
  doc_type text not null,

  -- Required when doc_type = 'Other', rejected otherwise (constraint below).
  -- This is what the applicant sees as the document's name.
  custom_name text,

  -- Where to find it / what it must show. Free text from the reviewer, shown
  -- verbatim to the applicant.
  details text,

  -- Extension the applicant should upload, without the dot. 'any' means any
  -- accepted type. Constrained to what common/file-validation.ts actually
  -- accepts — offering a type the API rejects is a dead end for the applicant.
  file_type text not null default 'pdf',

  status text not null default 'Pending',

  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),

  -- Set when the applicant uploads against this request. on delete set null so
  -- a client deleting a draft document does not cascade the request away — it
  -- reverts to outstanding instead (see trg_document_request_unfulfil below).
  fulfilled_document_id uuid references public.loan_documents(id) on delete set null,
  fulfilled_at timestamptz,

  cancelled_at timestamptz,

  constraint document_requests_status_check
    check (status in ('Pending', 'Fulfilled', 'Cancelled')),
  constraint document_requests_file_type_check
    check (file_type in ('pdf', 'doc', 'docx', 'any')),
  -- 'Other' is meaningless without a name; a named type must not carry one, or
  -- two sources of truth for the label appear.
  constraint document_requests_custom_name_check
    check (
      (doc_type = 'Other' and custom_name is not null and length(btrim(custom_name)) > 0)
      or (doc_type <> 'Other' and custom_name is null)
    ),
  constraint document_requests_fulfilled_check
    check (
      (status = 'Fulfilled' and fulfilled_document_id is not null and fulfilled_at is not null)
      or (status <> 'Fulfilled' and fulfilled_at is null)
    )
);

comment on table public.document_requests is
  'Per-application requests raised by a reviewer for a document the applicant has not supplied. Distinct from document_requirements, which is product-level configuration.';
comment on column public.document_requests.doc_type is
  'Checklist key (see client-ui/src/lib/requirements.ts DOCUMENT_LABELS) or the literal ''Other''.';
comment on column public.document_requests.custom_name is
  'Applicant-facing name. Required when doc_type = ''Other'', null otherwise.';
comment on column public.document_requests.file_type is
  'pdf | doc | docx | any. Must stay a subset of ALLOWED_DOCUMENT_EXTENSIONS in backend-node/src/common/file-validation.ts.';

create index if not exists idx_document_requests_application_id
  on public.document_requests(application_id);
create index if not exists idx_document_requests_status
  on public.document_requests(application_id, status);
create unique index if not exists uq_document_requests_fulfilled_document
  on public.document_requests(fulfilled_document_id)
  where fulfilled_document_id is not null;

-- Stops a reviewer stacking duplicate open asks for the same checklist type on
-- one case. 'Other' rows are excluded — two different named documents are a
-- legitimate pair of requests.
create unique index if not exists uq_document_requests_open_per_type
  on public.document_requests(application_id, doc_type)
  where status = 'Pending' and doc_type <> 'Other';

-- ---------------------------------------------------------------------------
-- 2. The request definition is the reviewer's, not the applicant's
--
-- The applicant needs UPDATE on their own requests so fulfilment can be
-- recorded under their JWT (RLS applies to the API's queries — see
-- backend-node/src/database/rls-transaction.interceptor.ts). RLS cannot scope
-- that to particular columns, so the immutable fields are pinned by trigger
-- instead. Mirrors trg_prevent_immutable_document_changes on loan_documents.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_document_request_redefinition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_in_role(auth.uid(), 'Admin')
     or public.is_in_role(auth.uid(), 'SuperAdmin')
     or public.is_in_role(auth.uid(), 'ProgramManager')
     or public.is_in_role(auth.uid(), 'Board')
     or public.is_in_role(auth.uid(), 'LoanOfficer') then
    return new;
  end if;

  if new.application_id is distinct from old.application_id
     or new.doc_type      is distinct from old.doc_type
     or new.custom_name   is distinct from old.custom_name
     or new.details       is distinct from old.details
     or new.file_type     is distinct from old.file_type
     or new.requested_by  is distinct from old.requested_by then
    raise exception 'A document request''s definition can only be changed by the requesting team';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_document_request_redefinition on public.document_requests;
create trigger trg_prevent_document_request_redefinition
before update on public.document_requests
for each row
execute function public.prevent_document_request_redefinition();

-- ---------------------------------------------------------------------------
-- 3. Deleting the fulfilling document reopens the request
--
-- Without this, a client who deletes the document they uploaded against a
-- request (allowed while the application is Draft) leaves it reading
-- 'Fulfilled' with nothing behind it — the check constraint would also be
-- violated by the plain `on delete set null`.
-- ---------------------------------------------------------------------------
create or replace function public.unfulfil_document_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.document_requests
     set status = 'Pending',
         fulfilled_document_id = null,
         fulfilled_at = null
   where fulfilled_document_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_document_request_unfulfil on public.loan_documents;
create trigger trg_document_request_unfulfil
before delete on public.loan_documents
for each row
execute function public.unfulfil_document_request();

-- ---------------------------------------------------------------------------
-- 4. RLS
--
-- Role lists are spelled out rather than delegated to a helper because that is
-- how every other policy in this schema reads. They carry BOTH the legacy roles
-- (Admin / LoanOfficer / Intern / Originator) and the workflow roles from
-- 20260805120000 — the legacy-to-workflow RLS rewrite is still outstanding for
-- the older tables, and a new table that knew only one set would lock out half
-- the staff.
-- ---------------------------------------------------------------------------
alter table public.document_requests enable row level security;

drop policy if exists "document requests read by related role" on public.document_requests;
create policy "document requests read by related role"
on public.document_requests
for select
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'SuperAdmin')
  or public.is_in_role(auth.uid(), 'ProgramManager')
  or public.is_in_role(auth.uid(), 'Board')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = document_requests.application_id
      and (
        c.user_id = auth.uid()
        or la.assigned_to_user_id = auth.uid()
      )
  )
);

drop policy if exists "document requests insert by reviewer" on public.document_requests;
create policy "document requests insert by reviewer"
on public.document_requests
for insert
to authenticated
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'SuperAdmin')
  or public.is_in_role(auth.uid(), 'ProgramManager')
  or public.is_in_role(auth.uid(), 'Board')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or (
    (
      public.is_in_role(auth.uid(), 'IntakeClerk')
      or public.is_in_role(auth.uid(), 'ProgramOfficer')
      or public.is_in_role(auth.uid(), 'RiskAnalyst')
      or public.is_in_role(auth.uid(), 'ReviewCommittee')
      or public.is_in_role(auth.uid(), 'Legal')
      or public.is_in_role(auth.uid(), 'FinanceOfficer')
      or public.is_in_role(auth.uid(), 'Intern')
      or public.is_in_role(auth.uid(), 'Originator')
    )
    and exists (
      select 1 from public.loan_applications la
      where la.id = document_requests.application_id
        and la.assigned_to_user_id = auth.uid()
    )
  )
);

-- Staff cancel; the applicant fulfils. The trigger above is what keeps the
-- applicant's UPDATE to the fulfilment columns.
drop policy if exists "document requests update by related role" on public.document_requests;
create policy "document requests update by related role"
on public.document_requests
for update
to authenticated
using (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'SuperAdmin')
  or public.is_in_role(auth.uid(), 'ProgramManager')
  or public.is_in_role(auth.uid(), 'Board')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = document_requests.application_id
      and (
        c.user_id = auth.uid()
        or la.assigned_to_user_id = auth.uid()
      )
  )
)
with check (
  public.is_in_role(auth.uid(), 'Admin')
  or public.is_in_role(auth.uid(), 'SuperAdmin')
  or public.is_in_role(auth.uid(), 'ProgramManager')
  or public.is_in_role(auth.uid(), 'Board')
  or public.is_in_role(auth.uid(), 'LoanOfficer')
  or exists (
    select 1
    from public.loan_applications la
    join public.clients c on c.id = la.client_id
    where la.id = document_requests.application_id
      and (
        c.user_id = auth.uid()
        or la.assigned_to_user_id = auth.uid()
      )
  )
);

-- No delete policy, deliberately: a request that was raised and then withdrawn
-- is part of the case history. Cancelling sets status = 'Cancelled'.

commit;
