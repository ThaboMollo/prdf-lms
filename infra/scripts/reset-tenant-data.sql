-- =============================================================================
-- TENANT DATA RESET — DESTRUCTIVE AND IRREVERSIBLE
--
-- Returns a deployment to a blank slate: every application, loan, document,
-- repayment, note, task, notification and audit record is removed, along with
-- every user account. Reference/configuration data (roles, notification
-- templates, the loan product and its document requirements) is rebuilt.
--
-- Intended to be run ONCE, immediately before go-live, to clear demo and test
-- data. It is not a maintenance tool.
--
-- DO NOT run this directly. Use reset-tenant-data.sh, which enforces the
-- confirmation and backup checks. This file is kept separate so the exact SQL
-- can be reviewed before anyone runs it.
--
-- Two things this CANNOT do — read these before running:
--
--   1. STORAGE FILES ARE NOT DELETED. Removing rows from loan_documents does
--      not remove the uploaded files from the `loan-documents` storage bucket.
--      Those must be deleted separately via the Storage API or dashboard, or
--      the bucket will still hold every document from before the reset.
--
--   2. YOU WILL BE LOCKED OUT UNTIL YOU BOOTSTRAP AN ADMIN. Deleting
--      auth.users removes every account, including every SuperAdmin. New
--      signups receive only the `Client` role (handle_new_user), and
--      admin_access_assign_role requires an existing SuperAdmin to grant
--      anything — so there is no in-app path back to an admin account. The
--      runner script prints the SQL to fix this; run it after the first
--      person registers.
-- =============================================================================

begin;

-- --- Before ---------------------------------------------------------------
\echo '--- Row counts BEFORE reset ---'
select 'auth.users' as table_name, count(*) from auth.users
union all select 'clients', count(*) from public.clients
union all select 'loan_applications', count(*) from public.loan_applications
union all select 'loan_documents', count(*) from public.loan_documents
union all select 'loans', count(*) from public.loans
union all select 'repayments', count(*) from public.repayments
union all select 'audit_log', count(*) from public.audit_log
order by 1;

-- --- Business and user data ------------------------------------------------
-- One TRUNCATE so it is a single atomic operation and FK order doesn't matter.
-- RESTART IDENTITY resets sequences, so a fresh deployment doesn't start
-- counting from wherever the demo data left off.
--
-- Reference tables are deliberately excluded here and rebuilt below.
truncate table
  public.application_consents,
  public.application_status_history,
  public.audit_log,
  public.clients,
  public.disbursements,
  public.loan_applications,
  public.loan_documents,
  public.loans,
  public.non_financial_support,
  public.notes,
  public.notifications,
  public.profiles,
  public.repayment_schedule,
  public.repayments,
  public.tasks,
  public.user_preferences,
  public.user_roles
restart identity cascade;

-- --- Accounts --------------------------------------------------------------
-- DELETE rather than TRUNCATE: Supabase's auth schema has dependent tables
-- (identities, sessions, refresh_tokens, mfa_factors) wired with ON DELETE
-- CASCADE, and DELETE respects those. TRUNCATE ... CASCADE would also work but
-- would truncate whatever else happens to reference auth.users, which is not
-- something this script should decide on a live project.
--
-- Volumes here are small; if this is ever slow, that is a signal the dataset
-- is larger than a pre-launch wipe should be touching.
delete from auth.users;

-- --- Reference data --------------------------------------------------------
-- Rebuilt rather than preserved, so the result is identical on every
-- deployment regardless of what was edited during testing.

truncate table
  public.document_requirements,
  public.loan_products,
  public.notification_templates,
  public.roles
restart identity cascade;

-- Roles (mirrors infra/supabase/seed/seed.sql)
insert into public.roles (name) values
  ('SuperAdmin'), ('Admin'), ('LoanOfficer'), ('Intern'), ('Originator'), ('Client')
on conflict (name) do nothing;

-- Loan product + document requirements.
-- NOTE: this reproduces the seeding in
-- infra/supabase/migrations/20260724120000_product_config_and_verification_gate.sql.
-- If the product definition or the required-document list changes there, it
-- must change here too — there is no shared source for it.
do $$
declare
  v_product_id uuid;
begin
  insert into public.loan_products (
    name, description, min_amount, max_amount,
    min_term_months, max_term_months, interest_rate, is_active
  )
  values (
    'PRDF Standard',
    'Default product seeded ahead of Phase 5 tenant provisioning — reproduces the limits/rate that were previously hardcoded in application code.',
    250000, 5000000, 1, 60, 18.5, true
  )
  returning id into v_product_id;

  insert into public.document_requirements
    (loan_product_id, required_at_status, doc_type, is_required, allows_multiple)
  values
    (v_product_id, 'Submitted', 'IDDocument',           true, false),
    (v_product_id, 'Submitted', 'ProofOfAddress',       true, false),
    (v_product_id, 'Submitted', 'BusinessRegistration', true, false),
    (v_product_id, 'Submitted', 'TaxClearance',         true, false),
    (v_product_id, 'Submitted', 'BankStatement',        true, true),
    (v_product_id, 'Submitted', 'Financials',           true, false),
    (v_product_id, 'Submitted', 'VendorQuotation',      true, true),
    (v_product_id, 'Submitted', 'RfqSupplierSpec',      true, false),
    (v_product_id, 'Submitted', 'PurchaseOrder',        true, false),
    (v_product_id, 'Submitted', 'TradeReference',       true, false);
end
$$;

-- Notification templates (mirrors infra/supabase/seed/seed.sql)
\i :seed_path

-- --- After -----------------------------------------------------------------
\echo ''
\echo '--- Row counts AFTER reset ---'
select 'auth.users' as table_name, count(*) from auth.users
union all select 'clients', count(*) from public.clients
union all select 'loan_applications', count(*) from public.loan_applications
union all select 'roles (expect 6)', count(*) from public.roles
union all select 'loan_products (expect 1)', count(*) from public.loan_products
union all select 'document_requirements (expect 10)', count(*) from public.document_requirements
union all select 'notification_templates', count(*) from public.notification_templates
order by 1;

-- Sanity: refuse to commit if reference data didn't rebuild correctly. Better
-- to roll the whole thing back than to leave a deployment that has been wiped
-- but cannot function.
do $$
declare
  n_roles int; n_products int; n_reqs int;
begin
  select count(*) into n_roles    from public.roles;
  select count(*) into n_products from public.loan_products;
  select count(*) into n_reqs     from public.document_requirements;

  if n_roles < 6 then
    raise exception 'Reference data rebuild failed: expected 6 roles, found %. Rolling back.', n_roles;
  end if;
  if n_products < 1 then
    raise exception 'Reference data rebuild failed: no loan_products row. Rolling back.';
  end if;
  if n_reqs < 10 then
    raise exception 'Reference data rebuild failed: expected 10 document_requirements, found %. Rolling back.', n_reqs;
  end if;
end
$$;

commit;
