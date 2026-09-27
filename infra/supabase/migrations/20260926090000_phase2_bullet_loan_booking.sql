-- Phase 2: bullet-at-maturity loan booking.
--
-- Planned in docs/credit-model-phase1-plan.md §10 ("Phase 2 handoff"): persist
-- the Risk-Analyst-chosen grade, replace the monthly buildRepaymentSchedule
-- with bullet-at-maturity, and book loans off the credit model.
--
-- Three defects this closes, all observed by walking application #0ddc6cd0
-- from Submitted to Disbursed through the portals on 2026-09-25:
--
--   1. The grade the Risk Analyst set at Due Diligence was never stored, so
--      ensureLoanCreatedForApproved() fell back to loan_products.interest_rate
--      (18.5%) — the legacy flat rate — instead of prime + grade margin.
--      Staff priced the case at 17.00% and the client was booked at 18.50%.
--
--   2. The schedule amortised monthly on a declining balance, charging
--      R75 156,26 of interest where the credit model prices R127 500,00 as
--      simple daily interest on full principal, frozen at maturity.
--
--   3. The R1 000 initiation and 3% management fees were quoted to the
--      applicant, acknowledged in the consent they signed, and then never
--      billed or recorded anywhere on the loan.
--
-- Additive only. Existing loans keep their rows and their schedules; the new
-- columns are nullable or defaulted so nothing already booked is rewritten.

-- ---------------------------------------------------------------------------
-- 1. The grade, on the application where the Risk Analyst sets it
-- ---------------------------------------------------------------------------
alter table public.loan_applications
  add column if not exists risk_grade text references public.risk_grades(grade);

comment on column public.loan_applications.risk_grade is
  'Risk grade set by the Risk Analyst at Due Diligence. Drives the booked annual rate (prime + margin). Null until graded.';

-- ---------------------------------------------------------------------------
-- 2. The credit-model terms, snapshotted onto the loan at booking time
--
-- Snapshotted rather than recomputed: pricing_config and risk_grades are
-- editable without a deploy, so a loan booked today must keep the numbers it
-- was booked on even after Prime moves.
-- ---------------------------------------------------------------------------
alter table public.loans
  add column if not exists risk_grade      text references public.risk_grades(grade),
  add column if not exists days_financed   int            check (days_financed > 0),
  add column if not exists initiation_fee  numeric(18,2)  not null default 0 check (initiation_fee  >= 0),
  add column if not exists management_fee  numeric(18,2)  not null default 0 check (management_fee  >= 0),
  add column if not exists net_advance     numeric(18,2)                 check (net_advance     >= 0);

comment on column public.loans.risk_grade is
  'Grade the loan was priced at. Snapshot — risk_grades.margin_pct may change later.';
comment on column public.loans.days_financed is
  'Days the interest was computed over. The credit model is driven by days; term_months is the portal''s unit.';
comment on column public.loans.initiation_fee is
  'Once-off initiation fee, snapshotted from pricing_config at booking.';
comment on column public.loans.management_fee is
  'Once-off management fee (principal x management_fee_pct), snapshotted at booking.';
comment on column public.loans.net_advance is
  'What the client actually receives: principal - initiation_fee - management_fee. Fees are deducted at disbursement and never enter the repayment schedule, which is why the credit model excludes them from "total due to funder".';

-- ---------------------------------------------------------------------------
-- 3. Report any loan booked before this migration
--
-- A notice, not a repair. Rewriting a booked schedule silently would change
-- what a client owes; these need a deliberate decision per loan.
-- ---------------------------------------------------------------------------
do $$
declare
  v_legacy int;
begin
  select count(*) into v_legacy
    from public.loans l
   where l.days_financed is null
     and l.status <> 'Closed';

  if v_legacy > 0 then
    raise notice
      '% open loan(s) were booked on the monthly-amortising model and still carry that schedule. They are unchanged by this migration and must be re-quoted or re-booked deliberately.',
      v_legacy;
  end if;
end $$;
