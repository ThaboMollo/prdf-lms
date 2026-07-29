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
      `insert into auth.users (id, email) values ($1,'staff@test'),($2,'a@test'),($3,'b@test')`,
      [STAFF, CLIENT_A, CLIENT_B],
    );
    // The signup trigger grants Client to everyone; staff must not keep it.
    await db.query(`delete from public.user_roles where user_id = $1`, [STAFF]);
    await db.query(
      `insert into public.user_roles (user_id, role_id)
       select $1, id from public.roles where name = 'LoanOfficer'`,
      [STAFF],
    );

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
