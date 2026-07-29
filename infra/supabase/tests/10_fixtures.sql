-- =============================================================================
-- Test fixtures — deterministic users, clients and applications for the RLS
-- assertions in 20_assertions.sql.
--
-- UUIDs are hardcoded and stable so assertions can reference them directly and
-- failures name a specific actor rather than a random id. Inserted as
-- superuser (RLS not yet in play); the assertions do the role-switching.
--
-- Note the signup trigger (`on_auth_user_created`) grants every new auth.users
-- row the `Client` role automatically, exactly as in production. Staff
-- fixtures therefore get their Client role removed explicitly, so that e.g.
-- the LoanOfficer is genuinely staff-only and a test can't pass for the wrong
-- reason.
-- =============================================================================

-- --- Users ----------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'client.alice@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'client.bob@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'client.carol@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'officer@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'intern.assigned@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'intern.unassigned@test.local'),
  ('cccccccc-0000-0000-0000-000000000001', 'admin@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'superadmin@test.local')
on conflict (id) do nothing;

-- --- Roles ----------------------------------------------------------------
-- Strip the auto-granted Client role from staff accounts.
delete from public.user_roles
where user_id in (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003',
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002'
);

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from (values
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'LoanOfficer'),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Intern'),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'Intern'),
  ('cccccccc-0000-0000-0000-000000000001'::uuid, 'Admin'),
  -- Platform ownership is represented only by SuperAdmin. Admin capability
  -- is inherited by is_in_role(), never duplicated as a managed role row.
  ('cccccccc-0000-0000-0000-000000000002'::uuid, 'SuperAdmin')
) as u(id, role_name)
join public.roles r on r.name = u.role_name
on conflict do nothing;

-- --- Clients --------------------------------------------------------------
insert into public.clients (id, user_id, business_name, registration_no)
values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice Trading', 'REG-ALICE-001'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Bob Holdings', 'REG-BOB-002'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'Carol Ventures', 'REG-CAROL-003')
on conflict (id) do nothing;

-- --- Applications ---------------------------------------------------------
-- One draft per client: `uniq_active_draft_per_client` is a real constraint,
-- so the assigned-application fixture belongs to a third client (Carol)
-- rather than giving Alice two drafts.
--
-- Amounts/terms sit inside the seeded PRDF Standard product's limits so the
-- product-validation trigger doesn't reject the fixtures themselves.
insert into public.loan_applications
  (id, client_id, loan_product_id, requested_amount, term_months, purpose, status, assigned_to_user_id)
select
  v.id, v.client_id, lp.id, v.amount, v.term, v.purpose, v.status, v.assigned
from (values
  -- Alice's draft, unassigned
  ('eeeeeeee-0000-0000-0000-000000000001'::uuid, 'dddddddd-0000-0000-0000-000000000001'::uuid,
   500000::numeric, 24, 'Alice working capital', 'Draft', null::uuid),
  -- Bob's draft, unassigned — the cross-client isolation target
  ('eeeeeeee-0000-0000-0000-000000000002'::uuid, 'dddddddd-0000-0000-0000-000000000002'::uuid,
   750000::numeric, 36, 'Bob equipment purchase', 'Draft', null::uuid),
  -- Carol's draft, assigned to the *assigned* intern. The unassigned intern
  -- must not be able to see or touch this one.
  ('eeeeeeee-0000-0000-0000-000000000003'::uuid, 'dddddddd-0000-0000-0000-000000000003'::uuid,
   1000000::numeric, 48, 'Carol expansion', 'Draft',
   'bbbbbbbb-0000-0000-0000-000000000002'::uuid)
) as v(id, client_id, amount, term, purpose, status, assigned)
cross join (select id from public.loan_products where name = 'PRDF Standard' limit 1) lp
on conflict (id) do nothing;

-- --- Documents ------------------------------------------------------------
-- One uploaded document on Alice's draft, used by the immutability assertions.
-- Deliberately NOT a complete required-document set, so the submission gate
-- still refuses Draft -> Submitted (which one assertion relies on).
insert into public.loan_documents
  (id, application_id, doc_type, storage_path, status, uploaded_by)
values
  ('ffffffff-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001',
   'ID_DOCUMENT',
   'applications/eeeeeeee-0000-0000-0000-000000000001/id.pdf',
   'Pending',
   'aaaaaaaa-0000-0000-0000-000000000001')
on conflict (id) do nothing;
