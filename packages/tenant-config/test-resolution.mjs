/**
 * Tenant resolution tests (docs/multi-tenant-spec.md §W7).
 *
 *   node packages/tenant-config/test-resolution.mjs
 *
 * This is the frontend half of tenant routing. The failure that matters is not
 * "resolution errors" — it is resolution quietly succeeding with the WRONG
 * tenant, which would serve one client's branding, copy and login form on
 * another client's domain. So the assertions are mostly about refusals.
 *
 * The package is consumed as TypeScript source by Vite (no build step), so the
 * test bundles it with esbuild — borrowed from client-ui's node_modules — and
 * evaluates the result. No test framework; see item T2 in
 * docs/outstanding-work.md.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
// esbuild lives in client-ui's node_modules (via Vite), not this package's —
// these packages deliberately carry no dependencies of their own, which is
// what stopped a duplicate React being bundled. Resolve from there explicitly
// rather than relying on the importer's location.
const require = createRequire(path.join(here, '../../client-ui/index.js'));
const { build } = require('esbuild');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function expectThrow(name, fn) {
  try {
    fn();
    failed++;
    console.log(`NOT OK | ${name} — did not throw`);
  } catch {
    passed++;
    console.log(`ok     | ${name}`);
  }
}

const result = await build({
  entryPoints: [path.join(here, 'index.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});

const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const {
  TENANTS,
  resolveTenantByDomain,
  resolveTenantById,
  resolveTenant,
  activeTenant,
  setActiveTenant,
  assertNoDomainCollisions,
} = mod.exports;

console.log('--- registry ---');
check('more than one tenant is configured', TENANTS.length >= 2, `got ${TENANTS.length}`);
check('every tenant declares at least one domain', TENANTS.every((t) => t.domains.length > 0),
  TENANTS.filter((t) => !t.domains.length).map((t) => t.id).join(',') || '');
check('no two tenants share a domain', (() => { try { assertNoDomainCollisions(); return true; } catch { return false; } })());

console.log('');
console.log('--- domain resolution ---');
const prdfHost = TENANTS.find((t) => t.id === 'prdf').domains[0];
const kgoloHost = TENANTS.find((t) => t.id === 'kgolo').domains[0];

check("a PRDF domain resolves to PRDF", resolveTenantByDomain(prdfHost)?.id === 'prdf');
check("a Kgolo domain resolves to Kgolo", resolveTenantByDomain(kgoloHost)?.id === 'kgolo');
check('resolution is case-insensitive', resolveTenantByDomain(prdfHost.toUpperCase())?.id === 'prdf');
check('an unknown domain resolves to null, NOT a default',
  resolveTenantByDomain('nobody.example.com') === null);
check('localhost resolves to null without an override',
  resolveTenantByDomain('localhost') === null);

console.log('');
console.log('--- the dev override is opt-in, not a fallback ---');
check('an explicit id override wins', resolveTenant('nobody.example.com', 'kgolo')?.id === 'kgolo');
check('an unknown host with no override still fails', resolveTenant('nobody.example.com', '') === null);
check('an unknown host with an unknown override still fails',
  resolveTenant('nobody.example.com', 'does-not-exist') === null);
check('id lookup is case-insensitive', resolveTenantById('PRDF')?.id === 'prdf');

console.log('');
console.log('--- active tenant must be set before use ---');
expectThrow('activeTenant() throws before bootstrap sets one', () => activeTenant());
setActiveTenant(TENANTS[0]);
check('activeTenant() returns the tenant once set', activeTenant().id === TENANTS[0].id);

console.log('');
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
