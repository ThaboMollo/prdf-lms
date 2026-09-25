-- Client portal loan band — narrow "PRDF Standard" to R250,000 – R1,000,000
-- over 1 – 36 months.
--
-- The seeded band (250k – 5m over 1 – 60 months, set in 20260724120000)
-- predates the credit model.
-- PRDF_Credit_Model_With_Total_Client_Revenue.xlsx caps lending at R1,000,000:
-- Purchase Order Funding runs R250k–R500k and Short-Term Contract Funding
-- R500k–R1m (Inputs!G9:G12). The portal offers the union as a single band, so
-- the only change needed is the ceiling.
--
-- The term ceiling drops to 36 months for the same reason: the model's longest
-- scenario is 1095 days (Short Term Base), which is 36 months at the portal's
-- daysPerYear/12 conversion. 37–60 months was never priced by the model and is
-- the range the client's calculator mockup removed.
--
-- Additive only — 20260724120000 is already applied and is never edited.

update public.loan_products
   set min_amount = 250000,
       max_amount = 1000000,
       min_term_months = 1,
       max_term_months = 36
 where name = 'PRDF Standard';

-- Heads-up, not a blocker. validate_loan_application_against_product() runs
-- `before insert or update`, so a non-Draft application already booked outside
-- the new limits would start failing on its NEXT update, not now. Report any
-- so they can be re-quoted deliberately rather than discovered as a 500.
-- Amount and term are counted separately because the term ceiling moved much
-- further (60 -> 36) and is the likelier of the two to catch existing rows.
do $$
declare
  v_amount_over int;
  v_term_over   int;
begin
  select
    count(*) filter (
      where a.requested_amount < p.min_amount or a.requested_amount > p.max_amount
    ),
    count(*) filter (
      where a.term_months < p.min_term_months or a.term_months > p.max_term_months
    )
    into v_amount_over, v_term_over
    from public.loan_applications a
    join public.loan_products p on p.id = a.loan_product_id
   where p.name = 'PRDF Standard'
     and a.status <> 'Draft';

  if v_amount_over > 0 then
    raise notice
      '% non-Draft application(s) sit outside the new R250,000-R1,000,000 amount band and will fail the product-limits trigger on their next update.',
      v_amount_over;
  end if;

  if v_term_over > 0 then
    raise notice
      '% non-Draft application(s) sit outside the new 1-36 month term band and will fail the product-limits trigger on their next update.',
      v_term_over;
  end if;
end $$;
