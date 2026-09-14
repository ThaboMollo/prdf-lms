-- ===========================================================================
-- PRDF LMS — 5 test loan applications from the Excel credit-model scenarios
-- ===========================================================================
-- Idempotent QA seed. Creates five client businesses (owned by the seeded
-- client@prdf.test portal user) and five loan applications spread across the
-- lifecycle, each mapped to a scenario from
-- PRDF_Credit_Model_With_Total_Client_Revenue.xlsx so QA can reproduce the
-- pricing breakdown on the Pricing tab.
--
-- Prereqs: run seed-test-users.sql first (needs client@prdf.test + the stage
-- owner test users) and the product config migration (needs "PRDF Standard").
--
-- SAFETY: TEST DATA ONLY. Deterministic UUIDs + on-conflict upserts, so
-- re-running converges. Do not run against production. Amounts/terms respect
-- the DB constraints (non-Draft: R250k–R5m, 1–60 months).
--
-- Scenario map (principal · risk grade · days financed -> term months used):
--   1. R250,000  · Low      · 90d  -> 3mo   (Purchase Order Funding — worked example, 15.5%)
--   2. R500,000  · Moderate · 180d -> 6mo   (Short-Term Contract Funding, 17%)
--   3. R750,000  · High     · 365d -> 12mo  (Short-Term Contract Funding, 19%)
--   4. R1,000,000· Worst    · 730d -> 24mo  (Short-Term Contract Funding, 21%)
--   5. R400,000  · Moderate · 90d  -> 3mo   (Purchase Order Funding, 17%)
-- On the Pricing tab, enter the principal, the risk grade, days financed, and
-- (optionally) days late = 30/60/90/120 to match the Excel late-payment table.
-- ===========================================================================

do $$
declare
  v_product_id uuid;
  v_client_user uuid := md5('prdf-test:client@prdf.test')::uuid;
begin
  select id into v_product_id from public.loan_products where name = 'PRDF Standard' limit 1;
  if v_product_id is null then
    raise exception 'PRDF Standard product not found — apply the product config migration first.';
  end if;

  -- Client businesses (deterministic ids so re-runs converge).
  insert into public.clients (id, user_id, business_name, registration_no, address, province, spatial_type, industry, gender, is_black_women_owned, is_hdp, cipc_registered)
  values
    (md5('prdf-test:app-client-1')::uuid, v_client_user, 'Thuli Manufacturing (Pty) Ltd', '2019/123456/07', '12 Industrial Rd, Johannesburg', 'Gauteng',      'City',     'Manufacturing',  'Female', true,  true,  true),
    (md5('prdf-test:app-client-2')::uuid, v_client_user, 'Sizwe Logistics CC',            '2016/654321/23', '5 Harbour Ave, Durban',          'KwaZulu-Natal','City',     'Logistics',      'Male',   false, true,  true),
    (md5('prdf-test:app-client-3')::uuid, v_client_user, 'Kagiso Agri Supplies',          '2020/222333/07', '88 Farm Rd, Polokwane',          'Limpopo',      'Rural',    'Agriculture',    'Male',   false, true,  true),
    (md5('prdf-test:app-client-4')::uuid, v_client_user, 'Naledi Construction Group',     '2015/999888/07', '3 Builders Park, Cape Town',     'Western Cape', 'City',     'Construction',   'Female', true,  true,  true),
    (md5('prdf-test:app-client-5')::uuid, v_client_user, 'Bongani Trading Enterprise',    '2021/111222/07', '17 Market St, Mbombela',         'Mpumalanga',   'Township', 'Wholesale',      'Male',   false, true,  true)
  on conflict (id) do update set
    business_name   = excluded.business_name,
    registration_no = excluded.registration_no,
    address         = excluded.address,
    province        = excluded.province,
    spatial_type    = excluded.spatial_type,
    industry        = excluded.industry,
    gender          = excluded.gender,
    is_black_women_owned = excluded.is_black_women_owned,
    is_hdp          = excluded.is_hdp,
    cipc_registered = excluded.cipc_registered,
    user_id         = excluded.user_id;

  -- Loan applications, one per scenario, spread across the lifecycle and
  -- assigned to the workflow role that owns that stage.
  insert into public.loan_applications
    (id, client_id, loan_product_id, requested_amount, term_months, purpose, status, submitted_at, assigned_to_user_id, created_at)
  values
    (md5('prdf-test:app-1')::uuid, md5('prdf-test:app-client-1')::uuid, v_product_id,  250000,  3,
     'Purchase Order Funding — supply of manufactured goods (Excel worked example: Low grade, 15.5%, 90 days).',
     'Submitted',   now() - interval '9 days',  md5('prdf-test:intakeclerk@prdf.test')::uuid,     now() - interval '9 days'),
    (md5('prdf-test:app-2')::uuid, md5('prdf-test:app-client-2')::uuid, v_product_id,  500000,  6,
     'Short-Term Contract Funding — logistics contract working capital (Moderate, 17%, 180 days).',
     'Screening',   now() - interval '7 days',  md5('prdf-test:programofficer@prdf.test')::uuid,  now() - interval '7 days'),
    (md5('prdf-test:app-3')::uuid, md5('prdf-test:app-client-3')::uuid, v_product_id,  750000, 12,
     'Short-Term Contract Funding — seasonal agri inputs (High, 19%, 365 days). Risk grade set at Due Diligence.',
     'DueDiligence',now() - interval '5 days',  md5('prdf-test:riskanalyst@prdf.test')::uuid,     now() - interval '5 days'),
    (md5('prdf-test:app-4')::uuid, md5('prdf-test:app-client-4')::uuid, v_product_id, 1000000, 24,
     'Short-Term Contract Funding — infrastructure sub-contract (Worst, 21%, 730 days).',
     'Evaluation',  now() - interval '3 days',  md5('prdf-test:reviewcommittee@prdf.test')::uuid, now() - interval '3 days'),
    (md5('prdf-test:app-5')::uuid, md5('prdf-test:app-client-5')::uuid, v_product_id,  400000,  3,
     'Purchase Order Funding — wholesale stock order (Moderate, 17%, 90 days).',
     'Approved',    now() - interval '2 days',  md5('prdf-test:board@prdf.test')::uuid,           now() - interval '2 days')
  on conflict (id) do update set
    client_id           = excluded.client_id,
    loan_product_id     = excluded.loan_product_id,
    requested_amount    = excluded.requested_amount,
    term_months         = excluded.term_months,
    purpose             = excluded.purpose,
    status              = excluded.status,
    submitted_at        = excluded.submitted_at,
    assigned_to_user_id = excluded.assigned_to_user_id;
end $$;

-- Verify.
select a.status,
       c.business_name,
       a.requested_amount,
       a.term_months,
       a.assigned_to_user_id
from public.loan_applications a
join public.clients c on c.id = a.client_id
where a.id in (
  md5('prdf-test:app-1')::uuid, md5('prdf-test:app-2')::uuid, md5('prdf-test:app-3')::uuid,
  md5('prdf-test:app-4')::uuid, md5('prdf-test:app-5')::uuid
)
order by a.requested_amount;
