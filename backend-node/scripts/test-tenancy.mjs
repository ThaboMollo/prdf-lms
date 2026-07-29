/**
 * Tenancy guard-rail tests (docs/multi-tenant-spec.md §4, §5).
 *
 *   npm run build && node scripts/test-tenancy.mjs
 *
 * These assert the FAILURE paths, which is where the risk lives. The whole
 * point of database-per-tenant is that a request can never touch the wrong
 * database — and every way that could happen is a silent fallback:
 *
 *   - a tenant that boots half-configured, missing a connection string
 *   - two tenants claiming one issuer, so routing is ambiguous
 *   - resolving a tenant by guessing when more than one is configured
 *   - a default pool used when no tenant is in context
 *
 * Each of those must be a loud refusal. Plain Node, no framework — see item
 * T2 in docs/outstanding-work.md.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let TenantRegistryService, TenantResolverMiddleware, currentTenant;
try {
  ({ TenantRegistryService } = require('../dist/tenancy/tenant-registry.service.js'));
  ({ TenantResolverMiddleware } = require('../dist/tenancy/tenant-resolver.middleware.js'));
  ({ currentTenant } = require('../dist/tenancy/request-context.js'));
} catch {
  console.error('Could not load dist/tenancy/* — run `npm run build` first.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function expectRefusal(name, fn) {
  let refused = false;
  let message = '';
  try {
    fn();
  } catch (error) {
    refused = true;
    message = error.message;
  }
  if (refused) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name} — was allowed; expected a refusal`);
  }
  return message;
}

function expectAllowed(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok     | ${name}`);
  } catch (error) {
    failed++;
    console.log(`NOT OK | ${name} — refused unexpectedly: ${error.message}`);
  }
}

/** Run fn with exactly the given env, restoring afterwards. */
function withEnv(vars, fn) {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('TENANT') || key.startsWith('SUPABASE_')) delete process.env[key];
  }
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

const VALID_A = {
  TENANT_A_ISSUER: 'https://a.supabase.co/auth/v1',
  TENANT_A_SUPABASE_URL: 'https://a.supabase.co',
  TENANT_A_SERVICE_ROLE_KEY: 'key-a',
  TENANT_A_DB_URL: 'postgresql://a',
  TENANT_A_DOMAINS: 'a.example.com',
};
const VALID_B = {
  TENANT_B_ISSUER: 'https://b.supabase.co/auth/v1',
  TENANT_B_SUPABASE_URL: 'https://b.supabase.co',
  TENANT_B_SERVICE_ROLE_KEY: 'key-b',
  TENANT_B_DB_URL: 'postgresql://b',
  TENANT_B_DOMAINS: 'b.example.com',
};

const load = (env) => {
  const registry = new TenantRegistryService();
  registry.onModuleInit();
  return registry;
};

console.log('--- configuration must be complete or boot fails ---');
withEnv({ TENANTS: 'a', TENANT_A_ISSUER: VALID_A.TENANT_A_ISSUER }, () =>
  expectRefusal('a tenant missing its DB URL refuses to boot', () => load()),
);
withEnv({ TENANTS: 'a', ...VALID_A }, () =>
  expectAllowed('a fully configured tenant boots', () => load()),
);
withEnv({}, () =>
  expectRefusal('no tenant config at all refuses to boot', () => load()),
);

console.log('');
console.log('--- routing must never be ambiguous ---');
withEnv(
  {
    TENANTS: 'a,b',
    ...VALID_A,
    ...VALID_B,
    TENANT_B_ISSUER: VALID_A.TENANT_A_ISSUER, // collide
  },
  () => expectRefusal('two tenants sharing an issuer refuses to boot', () => load()),
);
withEnv(
  { TENANTS: 'a,b', ...VALID_A, ...VALID_B, TENANT_B_DOMAINS: 'a.example.com' },
  () => expectRefusal('two tenants sharing a domain refuses to boot', () => load()),
);

console.log('');
console.log('--- issuer routing: authenticated requests (spec §1.1) ---');

/** Build an unsigned JWT. Routing only decodes it; the guard verifies. */
function tokenFor(issuer) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64({ iss: issuer, sub: 'u1' })}.AAAA`;
}
const reqWith = (headers) => ({ headers });

function resolvedSlug(registry, req) {
  const middleware = new TenantResolverMiddleware(registry);
  let slug = null;
  middleware.use(req, {}, () => {
    slug = currentTenant().slug;
  });
  return slug;
}

withEnv({ TENANTS: 'a,b', ...VALID_A, ...VALID_B }, () => {
  const registry = load();

  const a = resolvedSlug(registry, reqWith({ authorization: `Bearer ${tokenFor(VALID_A.TENANT_A_ISSUER)}` }));
  if (a === 'a') { passed++; console.log("ok     | tenant A's issuer routes to tenant A"); }
  else { failed++; console.log(`NOT OK | tenant A's issuer routed to ${a}`); }

  const b = resolvedSlug(registry, reqWith({ authorization: `Bearer ${tokenFor(VALID_B.TENANT_B_ISSUER)}` }));
  if (b === 'b') { passed++; console.log("ok     | tenant B's issuer routes to tenant B"); }
  else { failed++; console.log(`NOT OK | tenant B's issuer routed to ${b}`); }

  expectRefusal('an unknown issuer is refused, never routed', () =>
    resolvedSlug(registry, reqWith({ authorization: `Bearer ${tokenFor('https://evil.example.com/auth/v1')}` })),
  );
  expectRefusal('a malformed token is refused', () =>
    resolvedSlug(registry, reqWith({ authorization: 'Bearer not-a-jwt' })),
  );
  expectRefusal('a token with no issuer claim is refused', () =>
    resolvedSlug(registry, reqWith({ authorization: `Bearer ${tokenFor(undefined)}` })),
  );
});

// The critical one: with a single tenant configured, an unknown issuer must
// STILL be refused. Falling back "because there's only one tenant" would mean
// honouring tokens minted by an unrelated Supabase project.
withEnv({ TENANTS: 'a', ...VALID_A }, () => {
  const registry = load();
  expectRefusal('unknown issuer is refused even when only one tenant exists', () =>
    resolvedSlug(registry, reqWith({ authorization: `Bearer ${tokenFor('https://evil.example.com/auth/v1')}` })),
  );
});

console.log('');
console.log('--- host routing: unauthenticated requests (spec §1.2) ---');
withEnv({ TENANTS: 'a,b', ...VALID_A, ...VALID_B }, () => {
  const registry = load();

  const viaOrigin = resolvedSlug(registry, reqWith({ origin: 'https://b.example.com' }));
  if (viaOrigin === 'b') { passed++; console.log('ok     | Origin header routes to the owning tenant'); }
  else { failed++; console.log(`NOT OK | Origin routed to ${viaOrigin}`); }

  const viaHost = resolvedSlug(registry, reqWith({ host: 'a.example.com:443' }));
  if (viaHost === 'a') { passed++; console.log('ok     | Host header routes to the owning tenant'); }
  else { failed++; console.log(`NOT OK | Host routed to ${viaHost}`); }

  expectRefusal('unknown host with several tenants is refused', () =>
    resolvedSlug(registry, reqWith({ host: 'nobody.example.com' })),
  );
});

withEnv({ TENANTS: 'a', ...VALID_A }, () => {
  const registry = load();
  const slug = resolvedSlug(registry, reqWith({ host: 'unconfigured.example.com' }));
  if (slug === 'a') { passed++; console.log('ok     | unknown host with ONE tenant resolves to it (unambiguous, not a guess)'); }
  else { failed++; console.log(`NOT OK | single-tenant host fallback returned ${slug}`); }
});

console.log('');
console.log('--- there is no default tenant ---');
expectRefusal('currentTenant() outside a request throws rather than defaulting', () =>
  currentTenant(),
);

console.log('');
console.log('--- lookups ---');
withEnv({ TENANTS: 'a,b', ...VALID_A, ...VALID_B }, () => {
  const registry = load();
  const byIssuer = registry.findByIssuer('https://b.supabase.co/auth/v1');
  const byDomain = registry.findByDomain('A.Example.com');
  const unknown = registry.findByIssuer('https://evil.example.com/auth/v1');
  if (byIssuer?.slug === 'b') { passed++; console.log('ok     | issuer lookup resolves the right tenant'); }
  else { failed++; console.log(`NOT OK | issuer lookup returned ${byIssuer?.slug}`); }
  if (byDomain?.slug === 'a') { passed++; console.log('ok     | domain lookup is case-insensitive'); }
  else { failed++; console.log(`NOT OK | domain lookup returned ${byDomain?.slug}`); }
  if (unknown === null) { passed++; console.log('ok     | unknown issuer resolves to null, not a fallback'); }
  else { failed++; console.log(`NOT OK | unknown issuer returned ${unknown?.slug}`); }
});

console.log('');
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
