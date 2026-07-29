/**
 * Tests for ensureMfaSatisfied in src/auth/roles.helper.ts (spec §6.5).
 *
 *   npm run build && node scripts/test-mfa-enforcement.mjs
 *
 * The two properties that matter most here are the ones that cause outages
 * rather than breaches:
 *
 *   - With REQUIRE_MFA_FOR_STAFF unset/false, NOTHING is ever blocked. The
 *     flag exists so this can ship before staff enrol; if the "off" path ever
 *     blocked anyone, deploying it would lock every staff account out.
 *
 *   - Clients are never blocked, at any flag setting. MFA is a staff control;
 *     gating borrowers on it would take down the public application flow.
 *
 * Plain Node, no framework — see item T2 in docs/outstanding-work.md.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let helper;
try {
  helper = require('../dist/auth/roles.helper.js');
} catch {
  console.error('Could not load dist/auth/roles.helper.js — run `npm run build` first.');
  process.exit(1);
}

const { ensureMfaSatisfied } = helper;

let passed = 0;
let failed = 0;

function expect(name, { flag, roles, aal }, shouldBlock) {
  process.env.REQUIRE_MFA_FOR_STAFF = flag;
  let blocked = false;
  try {
    ensureMfaSatisfied({ userId: 'u', email: 'e@test', fullName: null, roles, aal });
  } catch {
    blocked = true;
  }
  if (blocked === shouldBlock) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name} — expected ${shouldBlock ? 'blocked' : 'allowed'}, got ${blocked ? 'blocked' : 'allowed'}`);
  }
}

console.log('--- flag off: never blocks (deploy-safe before staff enrol) ---');
expect('Admin at aal1 is allowed', { flag: 'false', roles: ['Admin'], aal: 'aal1' }, false);
expect('LoanOfficer with no aal claim is allowed', { flag: 'false', roles: ['LoanOfficer'], aal: undefined }, false);
expect('flag entirely unset is allowed', { flag: '', roles: ['Admin'], aal: 'aal1' }, false);

console.log('');
console.log('--- flag on: internal roles require aal2 ---');
expect('Admin at aal1 is blocked', { flag: 'true', roles: ['Admin'], aal: 'aal1' }, true);
expect('Admin with no aal claim is blocked', { flag: 'true', roles: ['Admin'], aal: undefined }, true);
expect('Admin at aal2 is allowed', { flag: 'true', roles: ['Admin'], aal: 'aal2' }, false);
expect('LoanOfficer at aal1 is blocked', { flag: 'true', roles: ['LoanOfficer'], aal: 'aal1' }, true);
expect('Intern at aal1 is blocked', { flag: 'true', roles: ['Intern'], aal: 'aal1' }, true);
expect('Originator at aal1 is blocked', { flag: 'true', roles: ['Originator'], aal: 'aal1' }, true);
expect('SuperAdmin (implies Admin) at aal1 is blocked', { flag: 'true', roles: ['SuperAdmin', 'Admin'], aal: 'aal1' }, true);

console.log('');
console.log('--- flag on: clients are never gated ---');
expect('Client at aal1 is allowed', { flag: 'true', roles: ['Client'], aal: 'aal1' }, false);
expect('Client with no aal claim is allowed', { flag: 'true', roles: ['Client'], aal: undefined }, false);
expect('user with no roles is allowed', { flag: 'true', roles: [], aal: undefined }, false);


// --- MFA reset authorisation -------------------------------------------------
// The only recovery path from an MFA lockout, so it is powerful: it lowers an
// account to password-only. Two properties matter — SuperAdmin only, and never
// self-service (resetting your own factor would let anyone with your password
// strip your second factor, defeating the control).
const { AdminService } = require('../dist/admin/admin.service.js');
const { runForTenant } = require('../dist/tenancy/request-context.js');

const FAKE_TENANT = {
  slug: 'test', issuer: 'https://test/auth/v1', supabaseUrl: 'https://unreachable.invalid',
  serviceRoleKey: 'k', databaseUrl: 'd', domains: [],
};
const stubDb = {
  queryOne: async () => null,
  execute: async () => 1,
  withTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
};

async function expectResetRefused(name, roles, actorId, targetId, shouldRefuse) {
  let refused = false;
  let message = '';
  try {
    const svc = new AdminService(stubDb);
    await runForTenant(FAKE_TENANT, () =>
      svc.resetMfa({ userId: actorId, email: 'e@test', fullName: null, roles }, targetId),
    );
  } catch (error) {
    refused = true;
    message = error.message;
  }
  // A DNS/network failure against the unreachable host means authorisation
  // ALLOWED the call through — that is the "permitted" outcome here.
  const refusedByAuthz =
    refused && !/ENOTFOUND|getaddrinfo|ECONN|Invalid URL|fetch failed|socket/i.test(message);

  if (refusedByAuthz === shouldRefuse) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name} — expected ${shouldRefuse ? 'refusal' : 'permitted'}`);
  }
}

console.log('');
console.log('--- MFA reset is SuperAdmin-only and never self-service ---');
await expectResetRefused('plain Admin cannot reset another user\'s MFA', ['Admin'], 'a1', 'u2', true);
await expectResetRefused('LoanOfficer cannot reset MFA', ['LoanOfficer'], 'a1', 'u2', true);
await expectResetRefused('Client cannot reset MFA', ['Client'], 'a1', 'u2', true);
await expectResetRefused('SuperAdmin cannot reset their OWN MFA', ['SuperAdmin', 'Admin'], 'same', 'same', true);
await expectResetRefused('SuperAdmin CAN reset another user', ['SuperAdmin', 'Admin'], 'a1', 'u2', false);

console.log('');
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
