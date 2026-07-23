-- Phase 13 — Enforce required application documents at the database level.
-- All 10 document types are mandatory before an application can be submitted;
-- the client UI writes to loan_applications directly (Supabase adapter), so a
-- BEFORE UPDATE trigger is the authoritative gate. Fires on any transition
-- into 'Submitted' (Draft -> Submitted and InfoRequested -> Submitted).
-- SECURITY DEFINER so the document check is not filtered by the caller's RLS.
-- Idempotent; safe to re-run.
--
-- Required types mirror client-ui/src/lib/requirements.ts and
-- client-ui/src/pages/ApplyPage.tsx DOC_SLOTS.

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

NOTIFY pgrst, 'reload schema';
