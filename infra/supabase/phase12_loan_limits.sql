-- Phase 12 — Enforce PRDF product loan limits at the database level:
-- requested_amount R250 000 – R5 000 000 and term_months 1 – 60.
-- Drafts are exempt (the apply wizard autosaves partial rows with amount/term 0);
-- the checks bite when the row leaves Draft, i.e. on submit. Added NOT VALID so
-- pre-existing rows outside the range don't block the migration — new inserts and
-- updates are still enforced. Idempotent; safe to re-run.
--
-- Limits mirror client-ui/src/lib/loanLimits.ts and
-- client-ui/docs/prdf-product-corrections-spec.md.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loan_applications_requested_amount_range'
      and conrelid = 'public.loan_applications'::regclass
  ) then
    alter table public.loan_applications
      add constraint loan_applications_requested_amount_range
      check (status = 'Draft' or (requested_amount >= 250000 and requested_amount <= 5000000))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loan_applications_term_months_range'
      and conrelid = 'public.loan_applications'::regclass
  ) then
    alter table public.loan_applications
      add constraint loan_applications_term_months_range
      check (status = 'Draft' or (term_months >= 1 and term_months <= 60))
      not valid;
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
