/**
 * API integration suite (docs/outstanding-work.md item T2).
 *
 *   npm run build && node scripts/test-api-integration.mjs
 *
 * Covers the money paths and the authorization matrix through the real HTTP
 * surface. That surface is where every authorization bug found in this project
 * actually lived — a client deleting another client's draft, a plain Admin
 * granting Admin, a forged storage path minting a signed URL for someone
 * else's documents. None of those were visible from unit-level reasoning.
 *
 * Complements rather than duplicates the other suites:
 *   infra/supabase/tests/    — RLS policies, at the database
 *   test-tenant-isolation    — cross-tenant routing, at the API
 *   this suite               — business logic + authorization, at the API
 *
 * Prerequisite: a local Postgres. The database is created and migrated here.
 */
import { execSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { startIssuer, bootApi, withDb, createRecorder, createCleanup } from './lib/harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const apiDir = path.resolve(here, '..');

const DB_NAME = 'prdf_api_test';
const OWNER = 'prdf_test_owner';
const OWNER_PW = 'prdf_owner_pw';
const DB_URL = `postgresql://${OWNER}:${OWNER_PW}@localhost:5432/${DB_NAME}`;
const API_PORT = 3195;
const ISSUER_PORT = 9111;

// Deterministic fixtures so a failure names a specific actor.
const STAFF = '11111111-0000-0000-0000-000000000001';
const CLIENT_A = '22222222-0000-0000-0000-000000000001';
const CLIENT_B = '22222222-0000-0000-0000-000000000002';
const ADMIN = '11111111-0000-0000-0000-000000000002';
const SUPER = '11111111-0000-0000-0000-000000000003';
// Role-grant target, kept separate so mutating it can't affect other sections.
const GRANTEE = '22222222-0000-0000-0000-000000000009';

const r = createRecorder();
const cleanup = createCleanup();

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

async function setupDatabase() {
  sh(`dropdb --if-exists ${DB_NAME}`);
  sh(`createdb -O ${OWNER} ${DB_NAME}`);

  // The API connects as the owner and then does `set local role authenticated`
  // per request (RlsTransactionInterceptor). That requires membership. This
  // mirrors production, where the connecting `postgres` role is a member of
  // `authenticated` — verified against the real project before the RLS-behind-
  // the-API design was relied on.
  //
  // The grant is one-directional on purpose: the owner may become
  // `authenticated`, but `authenticated` must NOT hold owner privileges, or
  // Postgres skips RLS via the table-owner bypass and every policy assertion
  // silently passes.
  sh(`psql -q -d postgres -c "grant authenticated to ${OWNER};"`);
  const psql = (args) => sh(`PGPASSWORD=${OWNER_PW} psql -q -v ON_ERROR_STOP=1 -U ${OWNER} -h localhost -d ${DB_NAME} ${args}`, { shell: '/bin/bash' });
  psql(`-c "create extension if not exists pgcrypto;"`);
  psql(`-f ${repoRoot}/infra/supabase/tests/00_shim.sql`);
  for (const file of sh(`ls ${repoRoot}/infra/supabase/migrations/*.sql`).trim().split('\n')) {
    psql(`-f ${file}`);
  }
  psql(`-f ${repoRoot}/infra/supabase/seed/seed.sql`);
}

/**
 * Seed users, a client, an approved application and a loan awaiting
 * disbursement — the state the money paths operate on.
 */
async function seed() {
  await withDb(DB_URL, async (db) => {
    await db.query(
      `insert into auth.users (id, email) values ($1,'staff@test'),($2,'a@test'),($3,'b@test'),($4,'admin@test'),($5,'super@test'),($6,'grantee@test')`,
      [STAFF, CLIENT_A, CLIENT_B, ADMIN, SUPER, GRANTEE],
    );
    // The signup trigger grants Client to everyone; internal users must not
    // keep it, or a test could pass because they were treated as a borrower.
    await db.query(`delete from public.user_roles where user_id = any($1)`, [[STAFF, ADMIN, SUPER]]);
    for (const [userId, role] of [[STAFF, 'LoanOfficer'], [ADMIN, 'Admin'], [SUPER, 'SuperAdmin']]) {
      await db.query(
        `insert into public.user_roles (user_id, role_id) select $1, id from public.roles where name = $2`,
        [userId, role],
      );
    }

    await db.query(
      `insert into public.clients (id, user_id, business_name)
       values ('33333333-0000-0000-0000-000000000001', $1, 'Client A Ltd'),
              ('33333333-0000-0000-0000-000000000002', $2, 'Client B Ltd')`,
      [CLIENT_A, CLIENT_B],
    );

    const product = await db.query(`select id from public.loan_products where is_active limit 1`);
    const productId = product.rows[0].id;

    // Two applications, one per client, so cross-client access is testable.
    // A's is Approved — disbursement moves it to Disbursed, and the status
    // transition trigger only permits that from Approved.
    await db.query(
      `insert into public.loan_applications (id, client_id, loan_product_id, requested_amount, term_months, purpose, status)
       values ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001',$1,300000,12,'A purpose','Approved'),
              ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000002',$1,400000,12,'B purpose','Draft')`,
      [productId],
    );

    // A loan awaiting disbursement. 12000 over 12 months keeps the arithmetic
    // easy to assert by hand.
    await db.query(
      `insert into public.loans (id, application_id, principal_amount, interest_rate, term_months, status, outstanding_principal)
       values ('55555555-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001',12000,18.5,12,'PendingDisbursement',12000)`,
    );
  });
}

async function main() {
  console.log('Setting up database...');
  await setupDatabase();
  await seed();

  const issuer = await startIssuer({ port: ISSUER_PORT });
  cleanup.add(() => issuer.close());

  const api = await bootApi({
    port: API_PORT,
    cwd: apiDir,
    env: {
      // Pinned explicitly: the spawned API loads backend-node/.env via
      // ConfigModule, which would otherwise override these with whatever the
      // developer has configured locally. A test that depends on an untracked
      // .env is not a test.
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      REQUIRE_MFA_FOR_STAFF: 'false',
      SENTRY_DSN: '',
      TENANTS: 't',
      TENANT_T_ISSUER: issuer.issuer,
      TENANT_T_SUPABASE_URL: issuer.supabaseUrl,
      TENANT_T_SERVICE_ROLE_KEY: 'test-key',
      TENANT_T_DB_URL: DB_URL,
      TENANT_T_DOMAINS: 'localhost',
    },
  });
  cleanup.add(() => api.kill());
  cleanup.add(() => { if (process.env.DEBUG_API) console.log(api.log.join('')); });

  const staffToken = await issuer.mint(STAFF);
  const adminToken = await issuer.mint(ADMIN);
  const superToken = await issuer.mint(SUPER);
  const clientAToken = await issuer.mint(CLIENT_A);
  const clientBToken = await issuer.mint(CLIENT_B);

  const call = (p, token, opts = {}) =>
    fetch(`${api.baseUrl}${p}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers ?? {}),
      },
    });

  const LOAN = '55555555-0000-0000-0000-000000000001';
  const APP_A = '44444444-0000-0000-0000-000000000001';
  const APP_B = '44444444-0000-0000-0000-000000000002';

  // ---------------------------------------------------------------- roles
  r.section('who the API thinks you are');
  {
    const me = await (await call('/me', staffToken)).json();
    r.check('staff resolves to LoanOfficer', me.roles?.includes('LoanOfficer'), JSON.stringify(me.roles));
    const meA = await (await call('/me', clientAToken)).json();
    r.check('a borrower resolves to Client only', meA.roles?.length === 1 && meA.roles[0] === 'Client', JSON.stringify(meA.roles));
  }

  // -------------------------------------------------- cross-client access
  r.section('a borrower cannot reach another borrower (spec §6, the recurring bug)');
  {
    const own = await call(`/api/applications/${APP_A}`, clientAToken);
    r.check("client A can read their own application", own.status === 200, `got ${own.status}`);

    const other = await call(`/api/applications/${APP_B}`, clientAToken);
    const otherBody = await other.text();
    // What matters is whether B's DATA came back, not the status code. A 200
    // carrying an empty body leaks nothing (though it is poor API hygiene —
    // "not found" should be 404).
    r.check("client A gets no data for client B's application",
      !otherBody.includes('B purpose'), `status=${other.status} body=${otherBody.slice(0, 120)}`);

    await call(`/api/applications/${APP_B}`, clientAToken, { method: 'DELETE' });
    const stillThere = await withDb(DB_URL, (db) =>
      db.query(`select 1 from public.loan_applications where id = $1`, [APP_B]));
    r.check("client A cannot actually delete client B's application",
      stillThere.rows.length === 1, 'B\'s application row was removed');

    const list = await (await call('/api/applications', clientAToken)).json();
    r.check('a borrower only lists their own applications',
      Array.isArray(list) && list.length === 1 && list[0].id === APP_A,
      `got ${Array.isArray(list) ? list.map((x) => x.id).join(',') : JSON.stringify(list)}`);

    const staffList = await (await call('/api/applications', staffToken)).json();
    r.check('staff list all applications', Array.isArray(staffList) && staffList.length === 2, `got ${staffList?.length}`);
  }

  // ------------------------------------------------------------ disburse
  r.section('disbursement');
  {
    const asClient = await call(`/api/loans/${LOAN}/disburse`, clientAToken, {
      method: 'POST', body: JSON.stringify({ amount: 100 }),
    });
    r.check('a borrower cannot disburse a loan', asClient.status >= 400, `got ${asClient.status}`);

    const negative = await call(`/api/loans/${LOAN}/disburse`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: -500 }),
    });
    r.check('a negative disbursement is rejected', negative.status === 400, `got ${negative.status}`);

    const zero = await call(`/api/loans/${LOAN}/disburse`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 0 }),
    });
    r.check('a zero disbursement is rejected', zero.status === 400, `got ${zero.status}`);

    const ok = await call(`/api/loans/${LOAN}/disburse`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 12000, reference: 'TEST-1' }),
    });
    const loan = await ok.json();
    r.check('staff can disburse', ok.status === 200 || ok.status === 201, `got ${ok.status}`);
    r.check('the loan becomes Disbursed', loan?.status === 'Disbursed', `got ${loan?.status}`);
    r.check('a repayment schedule is generated', (loan?.schedule?.length ?? 0) === 12, `got ${loan?.schedule?.length}`);

    const scheduleTotal = (loan.schedule ?? []).reduce((sum, s) => sum + Number(s.duePrincipal), 0);
    r.check('scheduled principal sums to the loan principal (no rounding drift)',
      Math.abs(scheduleTotal - 12000) < 0.01, `sum=${scheduleTotal}`);

    // Disbursing again must not build a second schedule.
    await call(`/api/loans/${LOAN}/disburse`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 1 }),
    });
    const after = await (await call(`/api/loans/${LOAN}`, staffToken)).json();
    r.check('re-disbursing does not duplicate the schedule', after.schedule?.length === 12, `got ${after.schedule?.length}`);
  }

  // ----------------------------------------------------------- repayment
  r.section('repayment allocation');
  {
    const asClient = await call(`/api/loans/${LOAN}/repayments`, clientAToken, {
      method: 'POST', body: JSON.stringify({ amount: 100 }),
    });
    r.check('a borrower cannot record a repayment', asClient.status >= 400, `got ${asClient.status}`);

    const negative = await call(`/api/loans/${LOAN}/repayments`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: -1000 }),
    });
    r.check('a negative repayment is rejected (it would inflate the debt)', negative.status === 400, `got ${negative.status}`);

    const before = await (await call(`/api/loans/${LOAN}`, staffToken)).json();
    const outstandingBefore = Number(before.outstandingPrincipal);

    await call(`/api/loans/${LOAN}/repayments`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 2000 }),
    });
    const afterPart = await (await call(`/api/loans/${LOAN}`, staffToken)).json();
    r.check('a partial repayment reduces outstanding principal by exactly the amount',
      Math.abs(Number(afterPart.outstandingPrincipal) - (outstandingBefore - 2000)) < 0.01,
      `before=${outstandingBefore} after=${afterPart.outstandingPrincipal}`);
    r.check('the loan stays open while a balance remains', afterPart.status !== 'Closed', `got ${afterPart.status}`);

    // Overpay the remainder and confirm closure.
    const remaining = Number(afterPart.outstandingPrincipal);
    await call(`/api/loans/${LOAN}/repayments`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: remaining + 500 }),
    });
    const closed = await (await call(`/api/loans/${LOAN}`, staffToken)).json();
    r.check('outstanding principal never goes negative',
      Number(closed.outstandingPrincipal) >= 0, `got ${closed.outstandingPrincipal}`);
    r.check('the loan closes once fully repaid', closed.status === 'Closed', `got ${closed.status}`);

    // Accounting invariant rather than inspecting one row: repayments come back
    // `order by paid_at desc`, and both payments share a now() timestamp, so
    // positional assertions are not stable. Totals are.
    const reps = closed.repayments ?? [];
    const principalPaid = reps.reduce((sum, x) => sum + Number(x.principalComponent), 0);
    const interestPaid = reps.reduce((sum, x) => sum + Number(x.interestComponent), 0);
    const amountPaid = reps.reduce((sum, x) => sum + Number(x.amount), 0);

    r.check('principal components sum to exactly the loan principal',
      Math.abs(principalPaid - 12000) < 0.01, `principalPaid=${principalPaid}`);
    r.check('the overpaid excess is captured, not silently dropped',
      Math.abs(interestPaid - 500) < 0.01, `interestPaid=${interestPaid}`);
    r.check('every cent paid is accounted for (principal + interest = amount)',
      Math.abs(principalPaid + interestPaid - amountPaid) < 0.01,
      `${principalPaid} + ${interestPaid} != ${amountPaid}`);

    const afterClose = await call(`/api/loans/${LOAN}/repayments`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 100 }),
    });
    r.check('a closed loan rejects further repayments', afterClose.status >= 400, `got ${afterClose.status}`);
  }

  // -------------------------------------------------- status transitions
  r.section('status transitions through the API');
  {
    const illegal = await call(`/api/applications/${APP_B}/status`, staffToken, {
      method: 'POST', body: JSON.stringify({ toStatus: 'Approved' }),
    });
    r.check('Draft -> Approved is refused through the API', illegal.status >= 400, `got ${illegal.status}`);

    const bogus = await call(`/api/applications/${APP_B}/status`, staffToken, {
      method: 'POST', body: JSON.stringify({ toStatus: 'NotAStatus' }),
    });
    r.check('an unknown status value is rejected', bogus.status === 400, `got ${bogus.status}`);
  }

  // ------------------------------------------------------------ documents
  r.section('document uploads (the S2 cross-client exposure)');
  {
    const badType = await call(`/api/applications/${APP_A}/documents/presign-upload`, clientAToken, {
      method: 'POST', body: JSON.stringify({ docType: 'IDDocument', fileName: 'evil.exe', contentType: 'application/pdf' }),
    });
    r.check('a disallowed file extension is refused before any URL is minted',
      badType.status === 400, `got ${badType.status}`);

    const badMime = await call(`/api/applications/${APP_A}/documents/presign-upload`, clientAToken, {
      method: 'POST', body: JSON.stringify({ docType: 'IDDocument', fileName: 'ok.pdf', contentType: 'application/x-msdownload' }),
    });
    r.check('a disallowed content type is refused even with an allowed extension',
      badMime.status === 400, `got ${badMime.status}`);

    // The exposure itself: recording a document row on YOUR application that
    // points at ANOTHER application's object key. The ownership check would
    // pass (the row really is yours) and the download URL is signed with the
    // service role key, which bypasses storage RLS.
    const foreignPath = await call(`/api/applications/${APP_A}/documents/confirm`, clientAToken, {
      method: 'POST',
      body: JSON.stringify({ docType: 'IDDocument', storagePath: `applications/${APP_B}/stolen.pdf` }),
    });
    r.check("a storage path belonging to another application is refused",
      foreignPath.status === 400, `got ${foreignPath.status}`);

    const traversal = await call(`/api/applications/${APP_A}/documents/confirm`, clientAToken, {
      method: 'POST',
      body: JSON.stringify({ docType: 'IDDocument', storagePath: `applications/${APP_A}/../${APP_B}/x.pdf` }),
    });
    r.check('a traversing storage path is refused', traversal.status === 400, `got ${traversal.status}`);

    const ok = await call(`/api/applications/${APP_A}/documents/confirm`, clientAToken, {
      method: 'POST',
      body: JSON.stringify({ docType: 'IDDocument', storagePath: `applications/${APP_A}/abc-id.pdf` }),
    });
    r.check("a borrower's own storage path is accepted", ok.status === 200 || ok.status === 201, `got ${ok.status}`);
  }

  // -------------------------------------------------------- role management
  r.section('role management (the "any Admin could grant Admin" regression)');
  {
    const byClient = await call(`/api/admin/users/${GRANTEE}/roles/Intern`, clientAToken, { method: 'POST' });
    r.check('a borrower cannot grant any role', byClient.status >= 400, `got ${byClient.status}`);

    const byOfficer = await call(`/api/admin/users/${GRANTEE}/roles/Intern`, staffToken, { method: 'POST' });
    r.check('a LoanOfficer cannot grant roles', byOfficer.status >= 400, `got ${byOfficer.status}`);

    const adminGrantsIntern = await call(`/api/admin/users/${GRANTEE}/roles/Intern`, adminToken, { method: 'POST' });
    r.check('an Admin can grant a non-elevated role', adminGrantsIntern.status === 200 || adminGrantsIntern.status === 201,
      `got ${adminGrantsIntern.status}`);

    const adminGrantsAdmin = await call(`/api/admin/users/${GRANTEE}/roles/Admin`, adminToken, { method: 'POST' });
    r.check('an Admin CANNOT grant Admin — SuperAdmin only', adminGrantsAdmin.status >= 400,
      `got ${adminGrantsAdmin.status}`);

    const superGrantsAdmin = await call(`/api/admin/users/${GRANTEE}/roles/Admin`, superToken, { method: 'POST' });
    r.check('a SuperAdmin can grant Admin', superGrantsAdmin.status === 200 || superGrantsAdmin.status === 201,
      `got ${superGrantsAdmin.status}`);

    const stillAdmin = await withDb(DB_URL, (db) => db.query(
      `select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [GRANTEE]));
    const names = stillAdmin.rows.map((x) => x.name);
    r.check('the grant actually persisted', names.includes('Admin'), names.join(','));
  }

  // -------------------------------------------------------------- reports
  r.section('reports are scoped by role, not global for everyone');
  {
    const staffPortfolio = await (await call('/api/reports/portfolio', staffToken)).json();
    r.check('staff see the whole portfolio', Number(staffPortfolio?.totalLoans) === 1,
      JSON.stringify(staffPortfolio));

    const clientBPortfolio = await (await call('/api/reports/portfolio', clientBToken)).json();
    r.check("a borrower with no loans sees an empty portfolio, not the lender's",
      Number(clientBPortfolio?.totalLoans) === 0, JSON.stringify(clientBPortfolio));

    const clientAPortfolio = await (await call('/api/reports/portfolio', clientAToken)).json();
    r.check('a borrower sees only their own loan', Number(clientAPortfolio?.totalLoans) === 1,
      JSON.stringify(clientAPortfolio));

    const audit = await call('/api/reports/audit', clientAToken);
    r.check('a borrower cannot read the audit log', audit.status >= 400, `got ${audit.status}`);
  }

  // ------------------------------------------------- validation contract
  r.section('validation errors arrive attached to the field that caused them');
  {
    const res = await call('/api/applications', clientAToken, {
      method: 'POST',
      body: JSON.stringify({ requestedAmount: 'not-a-number', termMonths: -5, purpose: 'x' }),
    });
    const body = await res.json();

    r.check('an invalid payload is a 400', res.status === 400, `got ${res.status}`);
    r.check('the response carries a structured errors array',
      Array.isArray(body.errors), JSON.stringify(body).slice(0, 160));

    const fields = (body.errors ?? []).map((e) => e.field);
    r.check('the offending field names survive to the wire',
      fields.includes('requestedAmount') && fields.includes('termMonths'), fields.join(','));

    r.check('each error carries a stable machine code, not just prose',
      (body.errors ?? []).every((e) => typeof e.code === 'string' && e.code.length > 0),
      JSON.stringify(body.errors));

    r.check('a human-readable summary is still present for a banner',
      typeof body.message === 'string' && body.message.length > 0, `message=${body.message}`);

    // forbidNonWhitelisted rejects unknown properties; that must be
    // attributable too, not surfaced as anonymous prose.
    const unknown = await call('/api/applications', clientAToken, {
      method: 'POST',
      body: JSON.stringify({ requestedAmount: 300000, termMonths: 12, purpose: 'valid', notAField: 1 }),
    });
    const unknownBody = await unknown.json();
    r.check('an unknown property is reported against its own field name',
      (unknownBody.errors ?? []).some((e) => e.field === 'notAField'),
      JSON.stringify(unknownBody.errors));

    // The money forms on admin-ui's Loan Details page key their inputs on the
    // DTO property name, so `amount` is not cosmetic — it is the join between
    // the server's rejection and the input that gets highlighted. If the DTO
    // property is ever renamed without the form following, the message would
    // silently stop appearing on the field and fall back to a banner.
    const badDisburse = await call(`/api/loans/${LOAN}/disburse`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: -500 }),
    });
    const badDisburseBody = await badDisburse.json();
    r.check('a rejected disbursement is attributed to the `amount` field',
      (badDisburseBody.errors ?? []).some((e) => e.field === 'amount'),
      JSON.stringify(badDisburseBody.errors));

    const badRepayment = await call(`/api/loans/${LOAN}/repayments`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 'lots' }),
    });
    const badRepaymentBody = await badRepayment.json();
    r.check('a rejected repayment is attributed to the `amount` field',
      (badRepaymentBody.errors ?? []).some((e) => e.field === 'amount'),
      JSON.stringify(badRepaymentBody.errors));
    r.check('...with a type code the UI can branch on',
      (badRepaymentBody.errors ?? []).some((e) => e.field === 'amount' && e.code === 'type'),
      JSON.stringify(badRepaymentBody.errors));
  }

  // ------------------------------------------------- bypass the browser
  // docs/validation-spec.md §8. Every rule below was enforced ONLY in the
  // browser before workstream A4. The API is directly callable, so a rule the
  // client alone enforces is advisory — these send exactly what a curl request
  // would and assert the server refuses on its own.
  r.section('rules survive when the browser is bypassed');
  {
    const reject = async (label, patch, expectedField) => {
      const res = await call('/api/applications', clientAToken, {
        method: 'POST',
        body: JSON.stringify({ requestedAmount: 300000, termMonths: 12, purpose: 'Working capital', ...patch }),
      });
      const body = await res.json().catch(() => ({}));
      const fields = (body.errors ?? []).map((e) => e.field);
      r.check(label, res.status === 400 && fields.includes(expectedField),
        `status=${res.status} fields=${fields.join(',') || '(none)'}`);
    };

    await reject('a citizenship percentage above 100 is refused', { saCitizenshipPercentage: 500 }, 'saCitizenshipPercentage');
    await reject('a negative citizenship percentage is refused', { saCitizenshipPercentage: -1 }, 'saCitizenshipPercentage');
    await reject('a business with 0 employees is refused', { numberOfEmployees: 0 }, 'numberOfEmployees');
    await reject('an invented province is refused', { province: 'Atlantis' }, 'province');
    await reject('an invented spatial type is refused', { spatialType: 'Orbital' }, 'spatialType');
    await reject('an invented industry is refused', { industry: 'Cryptocurrency' }, 'industry');
    await reject('an invented gender value is refused', { gender: 'Yes' }, 'gender');
    await reject('a one-character business name is refused', { businessName: 'A' }, 'businessName');
    await reject('a too-short SARS tax PIN is refused', { sarsTaxPin: '12' }, 'sarsTaxPin');
    await reject('a negative years-in-operation is refused', { yearsInOperation: -3 }, 'yearsInOperation');

    // Retired industries must still round-trip: client profiles written before
    // 2026-07-15 hold them, and any update resends the stored value. Rejecting
    // those would break existing users mid-application for no security gain.
    const retired = await call('/api/applications', clientAToken, {
      method: 'POST',
      body: JSON.stringify({ requestedAmount: 300000, termMonths: 12, purpose: 'Working capital', industry: 'Retail' }),
    });
    r.check('a retired industry value is still accepted', retired.status < 400,
      `got ${retired.status}`);

    // Drafts are partial by definition and the wizard autosaves on a debounce
    // while the user types. If a blank field were treated as invalid, saving
    // would start failing on the first keystroke — this is the assertion that
    // catches a future tightening breaking the wizard.
    //
    // A PUT, not a POST: `uniq_active_draft_per_client` allows one active draft
    // per client, and autosave overwhelmingly updates an existing draft rather
    // than creating one.
    const draftId = (await retired.json().catch(() => ({})))?.id;
    const blankAutosave = draftId
      ? await call(`/api/applications/${draftId}`, clientAToken, {
          method: 'PUT',
          body: JSON.stringify({
            requestedAmount: 300000, termMonths: 12,
            purpose: '', businessName: '', registrationNo: '', industry: '',
            province: '', spatialType: '', gender: '', sarsTaxPin: '', bankName: '',
          }),
        })
      : null;
    r.check('an autosave full of blanks still saves',
      blankAutosave !== null && blankAutosave.status < 400,
      blankAutosave ? `got ${blankAutosave.status}` : 'no draft to update');
  }

  // ------------------------------------------- submit-time completeness
  // Blank is tolerated on a draft but must NOT survive to submission. Nothing
  // checked this before: an application could be submitted with an empty
  // purpose, because the only submit-time checks were loan limits and
  // required documents.
  r.section('blank is tolerated on a draft but refused at submit');
  {
    const INCOMPLETE_USER = '22222222-0000-0000-0000-00000000000c';
    const INCOMPLETE_CLIENT = '33333333-0000-0000-0000-00000000000c';
    const INCOMPLETE_APP = '44444444-0000-0000-0000-00000000000c';

    // Seeded directly: the API deliberately will not let a caller *create* an
    // application this empty, but rows like it exist from before the rule.
    await withDb(DB_URL, async (db) => {
      await db.query(`insert into auth.users (id, email) values ($1,'incomplete@test')`, [INCOMPLETE_USER]);
      await db.query(
        `insert into public.clients (id, user_id, business_name) values ($1,$2,'Incomplete Ltd')`,
        [INCOMPLETE_CLIENT, INCOMPLETE_USER],
      );
      const product = await db.query(`select id from public.loan_products where is_active limit 1`);
      await db.query(
        `insert into public.loan_applications (id, client_id, loan_product_id, requested_amount, term_months, purpose, status)
         values ($1,$2,$3,300000,12,'','Draft')`,
        [INCOMPLETE_APP, INCOMPLETE_CLIENT, product.rows[0].id],
      );

      // Documents are seeded UP FRONT so the submit below can fail for exactly
      // one reason — the empty purpose. Leaving them missing lets the
      // pre-existing document gate reject the request first, which would make
      // the assertion pass even if the completeness check were deleted.
      const required = await db.query(
        `select doc_type from public.document_requirements
         where loan_product_id = $1 and required_at_status = 'Submitted' and is_required = true`,
        [product.rows[0].id],
      );
      for (const row of required.rows) {
        await db.query(
          `insert into public.loan_documents (id, application_id, doc_type, storage_path, status, uploaded_by)
           values (gen_random_uuid(), $1, $2, $3, 'Uploaded', $4)`,
          [INCOMPLETE_APP, row.doc_type, `applications/${INCOMPLETE_APP}/${row.doc_type}.pdf`, INCOMPLETE_USER],
        );
      }
    });

    const incompleteToken = await issuer.mint(INCOMPLETE_USER);
    const submitted = await call(`/api/applications/${INCOMPLETE_APP}/submit`, incompleteToken, {
      method: 'POST', body: JSON.stringify({ note: null }),
    });
    const submitBody = await submitted.json().catch(() => ({}));
    const submitFields = (submitBody.errors ?? []).map((e) => e.field);

    r.check('an application with no purpose cannot be submitted',
      submitted.status === 400, `got ${submitted.status} ${JSON.stringify(submitBody).slice(0, 160)}`);
    r.check('...and the missing field is named, not just refused',
      submitFields.includes('purpose'), JSON.stringify(submitBody.errors ?? submitBody).slice(0, 200));
    r.check('...and it is a 400, not a 500 — this is the user\'s input, not a fault',
      submitted.status !== 500, `got ${submitted.status}`);

    // A genuinely complete draft must still submit, or the new check is too
    // aggressive — a completeness rule that blocks valid applications is worse
    // than the gap it closed. Only the purpose was missing; documents were
    // seeded above.
    await withDb(DB_URL, (db) =>
      db.query(`update public.loan_applications set purpose = 'Working capital for stock' where id = $1`, [INCOMPLETE_APP]),
    );
    const resubmitted = await call(`/api/applications/${INCOMPLETE_APP}/submit`, incompleteToken, {
      method: 'POST', body: JSON.stringify({ note: null }),
    });
    r.check('a complete draft still submits',
      resubmitted.status < 400, `got ${resubmitted.status} ${(await resubmitted.text()).slice(0, 160)}`);
  }

  // ------------------------------------------- app vs database agreement
  // province and spatial_type carry CHECK constraints in the schema AND @IsIn
  // lists generated from packages/domain/constraints.ts. Those are two
  // independent definitions of the same rule, and they can drift apart in
  // either direction — a value the DTO accepts but the CHECK rejects becomes a
  // 500 at write time, and one the CHECK accepts but the DTO rejects is a
  // dropdown option users cannot actually submit.
  r.section('the app and the database agree on the closed sets');
  {
    const { SA_PROVINCES, SPATIAL_TYPES } = await import('../dist/common/generated-constraints.js');

    const checkValues = async (column) => {
      const rows = await withDb(DB_URL, (db) =>
        db.query(
          `select pg_get_constraintdef(con.oid) as def
           from pg_constraint con
           join pg_class rel on rel.oid = con.conrelid
           join pg_namespace ns on ns.oid = rel.relnamespace
           where ns.nspname = 'public' and rel.relname = 'clients'
             and con.contype = 'c' and pg_get_constraintdef(con.oid) like $1`,
          [`%${column}%`],
        ),
      );
      if (!rows.rows.length) return null;
      // Pull the quoted literals out of `... IN ('a'::text, 'b'::text)`.
      return [...rows.rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    };

    const dbProvinces = await checkValues('province');
    r.check('the province CHECK exists in the database', dbProvinces !== null);
    r.check('the province CHECK matches the generated @IsIn list',
      dbProvinces !== null && JSON.stringify(dbProvinces) === JSON.stringify([...SA_PROVINCES].sort()),
      `db=${JSON.stringify(dbProvinces)} app=${JSON.stringify([...SA_PROVINCES].sort())}`);

    const dbSpatial = await checkValues('spatial_type');
    r.check('the spatial_type CHECK exists in the database', dbSpatial !== null);
    r.check('the spatial_type CHECK matches the generated @IsIn list',
      dbSpatial !== null && JSON.stringify(dbSpatial) === JSON.stringify([...SPATIAL_TYPES].sort()),
      `db=${JSON.stringify(dbSpatial)} app=${JSON.stringify([...SPATIAL_TYPES].sort())}`);
  }

  // ---------------------------------------------- error classification
  // docs/validation-spec.md §A3. The filter used to infer the HTTP status by
  // substring-matching the thrown message, so an error's WORDING was its status
  // code. Running every throw site in the repo through those rules, 18 of 38
  // fell through to 500 + a Sentry alert — for ordinary user errors, with the
  // message replaced by "Internal server error" so the caller learned nothing.
  //
  // These assert on the status specifically, NOT `>= 400`. A `>= 400` check
  // passes on a 500, which is exactly how this went unnoticed.
  r.section('errors carry the right status, not one inferred from their wording');
  {
    // Was 500: "Only a SuperAdmin can perform this action." matched no rule.
    // Admin is an ELEVATED role, so granting it requires SuperAdmin — a plain
    // Admin must be refused. The attempt fails, so no state changes and the
    // role-management section is unaffected.
    const roleGrant = await call(`/api/admin/users/${GRANTEE}/roles/Admin`, adminToken, {
      method: 'POST',
    });
    r.check('an Admin granting Admin is 403, not 500',
      roleGrant.status === 403, `got ${roleGrant.status}`);

    // Was 500: "User cannot access this application." contains 'cannot access',
    // which DID match — this one guards the rule that was already right.
    // RLS hides B's row, so getOne() sees nothing and returns null, which Nest
    // serialises as a 200 with an empty body. Poor hygiene — "not found" ought
    // to be 404 — but not a leak, and the fix is an API-shape change rather
    // than an error-classification one. What must hold is that it is never a
    // 500 and never carries data. See docs/validation-spec.md §A3.
    const foreign = await call(`/api/applications/${APP_B}`, clientAToken);
    const foreignBody = await foreign.text();
    r.check("another client's application never returns 500",
      foreign.status !== 500, `got ${foreign.status}`);
    r.check("...and carries no data", !foreignBody.includes('B purpose'),
      foreignBody.slice(0, 80));

    // Was 500: "Only Draft applications can be submitted." matched nothing.
    // APP_A is Approved, so this is a state conflict, not bad input.
    const resubmit = await call(`/api/applications/${APP_A}/submit`, staffToken, {
      method: 'POST', body: JSON.stringify({ note: null }),
    });
    r.check('submitting a non-Draft application is 409, not 500',
      resubmit.status === 409, `got ${resubmit.status}`);
    const resubmitBody = await resubmit.json().catch(() => ({}));
    r.check('...and says why, rather than "Internal server error"',
      typeof resubmitBody.message === 'string' && !/internal server error/i.test(resubmitBody.message),
      JSON.stringify(resubmitBody.message));

    // Was 500: "Disbursement amount must be greater than zero." matched nothing.
    // Now 400 AND attributed to the field, so the form can highlight it.
    const zeroDisburse = await call(`/api/loans/${LOAN}/disburse`, staffToken, {
      method: 'POST', body: JSON.stringify({ amount: 0 }),
    });
    r.check('a zero disbursement is 400, not 500', zeroDisburse.status === 400, `got ${zeroDisburse.status}`);

    // Product limits are checked at SUBMIT, not at create — the schema's
    // trigger deliberately exempts Draft rows so autosaving partial data never
    // fails. So the draft is created first, then submitted.
    //
    // A dedicated borrower: uniq_active_draft_per_client allows one active draft
    // per client, and every other client in this suite already has one — the
    // unique violation would fire first and mask what is being tested.
    const LIMIT_USER = '22222222-0000-0000-0000-00000000000e';
    await withDb(DB_URL, async (db) => {
      await db.query(`insert into auth.users (id, email) values ($1,'limits@test')`, [LIMIT_USER]);
      await db.query(
        `insert into public.clients (id, user_id, business_name)
         values ('33333333-0000-0000-0000-00000000000e', $1, 'Limits Ltd')`,
        [LIMIT_USER],
      );
    });
    const limitToken = await issuer.mint(LIMIT_USER);
    const overDraft = await call('/api/applications', limitToken, {
      method: 'POST',
      body: JSON.stringify({ requestedAmount: 999999999, termMonths: 12, purpose: 'Working capital' }),
    });
    const overDraftId = (await overDraft.json().catch(() => ({})))?.id;
    const overLimit = await call(`/api/applications/${overDraftId}/submit`, limitToken, {
      method: 'POST', body: JSON.stringify({ note: null }),
    });
    const overBody = await overLimit.json().catch(() => ({}));

    r.check('a product-limit breach is 400, not 500',
      overLimit.status === 400, `got ${overLimit.status} ${JSON.stringify(overBody).slice(0, 140)}`);
    r.check('...and says which limit was breached, not "Internal server error"',
      typeof overBody.message === 'string' && !/internal server error/i.test(overBody.message),
      JSON.stringify(overBody.message));
    // The payoff of DomainError carrying a field: a rule enforced deep in a
    // service reaches the form the same way a DTO rejection does, so the
    // frontend needs no second code path to display it.
    r.check('...and is attributed to requestedAmount, like a DTO error',
      (overBody.errors ?? []).some((e) => e.field === 'requestedAmount'),
      JSON.stringify(overBody.errors ?? overBody).slice(0, 200));

    // A rule enforced ONLY by the database, with no service-level check in
    // front of it: uniq_active_draft_per_client. LIMIT_USER's draft still
    // exists (the submit above failed), so a second create violates it.
    //
    // This arrives as a Postgres 23505 and nothing else catches it, so it is
    // the assertion that covers the SQLSTATE branch. It was observed returning
    // a bare 500 during this work — a double-clicked "Save draft" would have
    // shown the user "Internal server error" and raised a Sentry alert.
    const duplicateDraft = await call('/api/applications', limitToken, {
      method: 'POST',
      body: JSON.stringify({ requestedAmount: 300000, termMonths: 12, purpose: 'Working capital' }),
    });
    const duplicateBody = await duplicateDraft.json().catch(() => ({}));
    r.check('a duplicate draft is 409, not 500',
      duplicateDraft.status === 409, `got ${duplicateDraft.status}`);
    // The constraint's own text names the constraint and its columns, which
    // describes the schema to anyone who can trigger it. Only P0001 RAISE
    // messages — written for humans — are passed through verbatim.
    r.check('...and does not leak the constraint name',
      !JSON.stringify(duplicateBody).includes('uniq_active_draft_per_client'),
      JSON.stringify(duplicateBody).slice(0, 160));

    // The one that must NOT become a 4xx: a deployment fault has to alert.
    // Only 500s reach Sentry, so misclassifying this hides an outage.
    const noSecret = await fetch(`${api.baseUrl}/internal/cron/notification-sweep`, { method: 'POST' });
    r.check('an unauthenticated cron call never returns 2xx', noSecret.status >= 400, `got ${noSecret.status}`);
  }

  // ------------------------------------------------------ audit trail
  r.section('money movements are audited');
  {
    const rows = await withDb(DB_URL, (db) =>
      db.query(`select action, count(*)::int as n from public.audit_log where entity in ('loans','repayments') group by action`),
    );
    const byAction = Object.fromEntries(rows.rows.map((x) => [x.action, x.n]));
    r.check('disbursements are audited', (byAction.DisburseLoan ?? 0) >= 1, JSON.stringify(byAction));
    r.check('repayments are audited', (byAction.RecordRepayment ?? 0) >= 1, JSON.stringify(byAction));
  }

  return r.summary();
}

main()
  .then(async (ok) => {
    await cleanup.run();
    sh(`dropdb --if-exists ${DB_NAME}`);
    process.exit(ok ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await cleanup.run();
    process.exit(1);
  });
