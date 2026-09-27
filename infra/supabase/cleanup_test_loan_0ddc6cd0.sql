-- Remove the pre-Phase-2 test application and its loan.
--
-- Application #0ddc6cd0 (Blue Harvest Aquaculture, R750 000) was walked from
-- Submitted to Disbursed on 2026-09-25 to document the workflow. It was booked
-- BEFORE the Phase 2 pricing fix, so it carries the wrong numbers:
--
--     rate      18.50%  (legacy flat product rate, not prime + Moderate margin)
--     schedule  12 monthly amortising instalments, R825 156,26 total
--     fees      none recorded
--
-- The correct booking for the same terms is 17.00%, a single bullet instalment
-- of R877 500,00 at maturity, R23 500,00 of fees deducted from the advance.
--
-- TEST DATA ONLY. This deletes a disbursed loan and its cash records, which is
-- never appropriate for a real loan — correct those by reversal, not deletion.
-- Safe here because no money moved: the disbursement is a bookkeeping row in
-- the test environment.
--
-- Run in the Supabase SQL editor. Ordered child-first; most of these would
-- cascade anyway, but disbursements/repayments are listed explicitly so the
-- row counts are visible in the output.

begin;

\set app_id '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c'

-- Show what is about to go, so the counts can be eyeballed before commit.
select 'loans'              as table, count(*) from public.loans              where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c'
union all
select 'repayment_schedule', count(*) from public.repayment_schedule where loan_id in (select id from public.loans where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c')
union all
select 'disbursements',      count(*) from public.disbursements      where loan_id in (select id from public.loans where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c')
union all
select 'repayments',         count(*) from public.repayments         where loan_id in (select id from public.loans where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c')
union all
select 'documents',          count(*) from public.loan_documents     where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c';

delete from public.repayment_schedule
 where loan_id in (select id from public.loans where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c');

delete from public.repayments
 where loan_id in (select id from public.loans where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c');

delete from public.disbursements
 where loan_id in (select id from public.loans where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c');

delete from public.loans
 where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c';

delete from public.application_status_history
 where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c';

delete from public.application_consents
 where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c';

delete from public.loan_documents
 where application_id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c';

delete from public.loan_applications
 where id = '0ddc6cd0-320f-48ca-80e9-5f9d9da1573c';

commit;

-- The document FILES stay in the loan-documents storage bucket; object rows
-- are not reachable from here. Eleven objects under
-- applications/0ddc6cd0-320f-48ca-80e9-5f9d9da1573c/ can be removed from the
-- Storage browser if you want them gone.
