-- Phase 2 — De-hardcode loan limits, interest rate, and required documents
-- into loan_products / document_requirements. Adds a database-enforced gate
-- requiring all required documents to be Verified (not just present) before
-- an application can move to Approved.
--
-- Additive only — 20260723180000_baseline.sql is already applied to
-- production and is never edited again, only built upon.

-- =============================================================================
-- 1. Schema changes
-- =============================================================================

alter table public.loan_products
  add column if not exists min_amount numeric(18,2),
  add column if not exists max_amount numeric(18,2),
  add column if not exists min_term_months int,
  add column if not exists max_term_months int,
  add column if not exists interest_rate numeric(6,3),
  add column if not exists is_active boolean not null default true;

alter table public.document_requirements
  add column if not exists allows_multiple boolean not null default false;

alter table public.loan_applications
  add column if not exists loan_product_id uuid references public.loan_products(id);

create index if not exists idx_loan_applications_product
  on public.loan_applications(loan_product_id);

-- =============================================================================
-- 2. Seed the default product + document requirements, backfill existing
--    applications, then make loan_product_id mandatory going forward.
--
-- This row is intentionally client-1-specific data living in the generic
-- migration chain, ahead of Phase 5's real per-tenant provisioning tooling.
-- Every client runs an isolated database, so a future client inheriting this
-- same "PRDF Standard" row in their own database is harmless clutter, not
-- cross-contamination — their own provisioning step replaces or ignores it.
-- =============================================================================

do $$
declare
  v_product_id uuid;
begin
  select id into v_product_id from public.loan_products where name = 'PRDF Standard' limit 1;

  if v_product_id is null then
    insert into public.loan_products (
      name, description, min_amount, max_amount, min_term_months, max_term_months, interest_rate, is_active
    )
    values (
      'PRDF Standard',
      'Default product seeded ahead of Phase 5 tenant provisioning — reproduces the limits/rate that were previously hardcoded in application code.',
      250000, 5000000, 1, 60, 18.5, true
    )
    returning id into v_product_id;
  end if;

  insert into public.document_requirements (loan_product_id, required_at_status, doc_type, is_required, allows_multiple)
  values
    (v_product_id, 'Submitted', 'IDDocument', true, false),
    (v_product_id, 'Submitted', 'ProofOfAddress', true, false),
    (v_product_id, 'Submitted', 'BusinessRegistration', true, false),
    (v_product_id, 'Submitted', 'TaxClearance', true, false),
    (v_product_id, 'Submitted', 'BankStatement', true, true),
    (v_product_id, 'Submitted', 'Financials', true, false),
    (v_product_id, 'Submitted', 'VendorQuotation', true, true),
    (v_product_id, 'Submitted', 'RfqSupplierSpec', true, false),
    (v_product_id, 'Submitted', 'PurchaseOrder', true, false),
    (v_product_id, 'Submitted', 'TradeReference', true, false)
  on conflict (loan_product_id, required_at_status, doc_type) do nothing;

  update public.loan_applications
  set loan_product_id = v_product_id
  where loan_product_id is null;
end $$;

alter table public.loan_applications
  alter column loan_product_id set not null;

-- =============================================================================
-- 3. Amount/term validation moves from a CHECK constraint to a trigger — a
--    plain CHECK constraint cannot reference another table's row. Preserves
--    the existing Draft exemption exactly.
-- =============================================================================

alter table public.loan_applications
  drop constraint if exists loan_applications_requested_amount_range,
  drop constraint if exists loan_applications_term_months_range;

create or replace function public.validate_loan_application_against_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_amount numeric(18,2);
  v_max_amount numeric(18,2);
  v_min_term int;
  v_max_term int;
begin
  if new.status = 'Draft' then
    return new;
  end if;

  select min_amount, max_amount, min_term_months, max_term_months
  into v_min_amount, v_max_amount, v_min_term, v_max_term
  from public.loan_products
  where id = new.loan_product_id;

  if v_min_amount is null then
    -- Product has no configured limits (shouldn't happen once every
    -- application has a loan_product_id, but fail open rather than block
    -- rather than assume a specific limit).
    return new;
  end if;

  if new.requested_amount < v_min_amount or new.requested_amount > v_max_amount then
    raise exception 'Requested amount % is outside the allowed range (% - %) for this loan product',
      new.requested_amount, v_min_amount, v_max_amount;
  end if;

  if new.term_months < v_min_term or new.term_months > v_max_term then
    raise exception 'Term % months is outside the allowed range (% - %) for this loan product',
      new.term_months, v_min_term, v_max_term;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_loan_application_limits on public.loan_applications;
create trigger trg_validate_loan_application_limits
  before insert or update on public.loan_applications
  for each row
  execute function public.validate_loan_application_against_product();

-- =============================================================================
-- 4. Required-document enforcement now reads document_requirements instead
--    of a hardcoded array. Same trigger, same firing condition.
-- =============================================================================

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
    select coalesce(array_agg(dr.doc_type), '{}') into missing
    from public.document_requirements dr
    where dr.loan_product_id = new.loan_product_id
      and dr.required_at_status = 'Submitted'
      and dr.is_required = true
      and not exists (
        select 1 from public.loan_documents d
        where d.application_id = new.id and d.doc_type = dr.doc_type
      );

    if array_length(missing, 1) > 0 then
      raise exception 'Cannot submit application: missing required document(s): %', array_to_string(missing, ', ');
    end if;
  end if;

  return new;
end;
$$;

-- Trigger definition unchanged (already exists from the baseline) — this
-- just picks up the new function body via CREATE OR REPLACE above.

-- =============================================================================
-- 5. New gate: approval requires every required document to be Verified,
--    not just present. Mirrors enforce_required_documents exactly.
-- =============================================================================

create or replace function public.enforce_document_verification_for_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  unverified text[];
begin
  if new.status = 'Approved' and old.status is distinct from 'Approved' then
    select coalesce(array_agg(dr.doc_type), '{}') into unverified
    from public.document_requirements dr
    where dr.loan_product_id = new.loan_product_id
      and dr.required_at_status = 'Submitted'
      and dr.is_required = true
      and not exists (
        select 1 from public.loan_documents d
        where d.application_id = new.id
          and d.doc_type = dr.doc_type
          and d.status = 'Verified'
      );

    if array_length(unverified, 1) > 0 then
      raise exception 'Cannot approve application: document(s) not verified: %', array_to_string(unverified, ', ');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_document_verification_for_approval on public.loan_applications;
create trigger trg_enforce_document_verification_for_approval
  before update of status on public.loan_applications
  for each row
  execute function public.enforce_document_verification_for_approval();

-- =============================================================================
-- 6. RLS: document_requirements needs to be client-readable (the apply
--    wizard needs to know what to ask for), same pattern as the existing
--    "loan products read all" policy. The existing staff-only "doc
--    requirements staff read write" policy (INSERT/UPDATE/DELETE) is
--    untouched — this only adds read access.
-- =============================================================================

drop policy if exists "document requirements read all" on public.document_requirements;
create policy "document requirements read all"
on public.document_requirements
for select
to authenticated
using (true);

-- The rate/amount/term limits are already displayed as public marketing
-- copy today (LOAN_AMOUNT_RANGE_LABEL / LENDING_RATE_LABEL are rendered on
-- unauthenticated pages — LandingPage, LoginPage, RegisterPage). Extending
-- read access to anon doesn't expose anything not already effectively
-- public; it lets the public calculator keep working once those hardcoded
-- constants are replaced by a DB read.
drop policy if exists "loan products read all anon" on public.loan_products;
create policy "loan products read all anon"
on public.loan_products
for select
to anon
using (is_active = true);

NOTIFY pgrst, 'reload schema';
