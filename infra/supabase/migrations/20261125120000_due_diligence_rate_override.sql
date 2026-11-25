-- Due Diligence interest rate override (PRDF Admin Corrections V3, 28-10-2026).
--
-- At Due Diligence the Risk Analyst sets the risk grade AND may key in the
-- annual interest rate the case is to be booked at. When set, it replaces the
-- calculated rate (prime + the grade's margin) in
-- ApplicationsService.ensureLoanCreatedForApproved(); the booked rate is still
-- snapshotted onto loans.interest_rate as before.
--
-- Additive only: nullable, so every existing application keeps booking at the
-- calculated rate.

alter table public.loan_applications
  add column if not exists interest_rate_override numeric(6,3)
    check (interest_rate_override > 0 and interest_rate_override <= 100);

comment on column public.loan_applications.interest_rate_override is
  'Annual rate (% p.a.) set by the Risk Analyst at Due Diligence. Overrides prime + risk-grade margin at booking. Null = use the calculated rate.';
