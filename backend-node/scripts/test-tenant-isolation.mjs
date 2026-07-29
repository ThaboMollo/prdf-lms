/**
 * Cross-tenant isolation suite — the step-5 GATE (docs/multi-tenant-spec.md §5).
 *
 *   npm run build && node scripts/test-tenant-isolation.mjs
 *
 * Shared-API multi-tenancy introduces exactly one new breach class that cannot
 * exist under isolation-per-deployment: a request resolving to the wrong
 * tenant. This suite tests that directly, end to end, against a running API —
 * not by reasoning about the code.
 *
 * Setup mirrors production as closely as a local machine allows:
 *
 *   - Two real Postgres databases (prdf_mt_a / prdf_mt_b), each with the full
 *     migration chain, standing in for two Supabase projects.
 *   - Two mock JWKS servers with genuine ES256 keypairs, standing in for two
 *     Supabase Auth issuers. Tokens are really signed and really verified.
 *   - The actual API process, booted with both tenants configured.
 *
 * Nothing here stubs the guard, the registry or the pool. A pass means the
 * deployed code refuses cross-tenant access; it does not mean a mock did.
 *
 * Prerequisites: local Postgres with prdf_mt_a / prdf_mt_b migrated
 * (infra/scripts/migrate-all.sh).
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { Client } = require('pg');

const PORT_A = 9101;
const PORT_B = 9102;
const API_PORT = 3199;

const DB_A = 'postgresql://prdf_test_owner:prdf_owner_pw@localhost:5432/prdf_mt_a';
const DB_B = 'postgresql://prdf_test_owner:prdf_owner_pw@localhost:5432/prdf_mt_b';

const ISSUER_A = `http://localhost:${PORT_A}/auth/v1`;
const ISSUER_B = `http://localhost:${PORT_B}/auth/v1`;

let passed = 0;
let failed = 0;
const cleanup = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A mock Supabase Auth issuer: serves one public key at the real JWKS path. */
async function startIssuer(port, publicJwk) {
  const server = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(port, resolve));
  cleanup.push(() => new Promise((r) => server.close(r)));
  return server;
}

async function seedTenant(connectionString, productName) {
  const client = new Client({ connectionString });
  await client.connect();
  // Distinguishable per tenant: if a request ever crosses, the product name
  // it returns says so immediately.
  await client.query(`update public.loan_products set is_active = false`);
  await client.query(
    `insert into public.loan_products (name, description, min_amount, max_amount, min_term_months, max_term_months, interest_rate, is_active)
     values ($1, 'isolation fixture', 1000, 100000, 1, 12, 10.0, true)`,
    [productName],
  );
  await client.end();
}

async function waitForApi() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${API_PORT}/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  // --- Two issuers with real keys -----------------------------------------
  const keysA = await generateKeyPair('ES256');
  const keysB = await generateKeyPair('ES256');
  const jwkA = { ...(await exportJWK(keysA.publicKey)), alg: 'ES256', use: 'sig', kid: 'key-a' };
  const jwkB = { ...(await exportJWK(keysB.publicKey)), alg: 'ES256', use: 'sig', kid: 'key-b' };

  await startIssuer(PORT_A, jwkA);
  await startIssuer(PORT_B, jwkB);

  const mint = (key, kid, issuer, sub) =>
    new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(key);

  const tokenA = await mint(keysA.privateKey, 'key-a', ISSUER_A, '11111111-1111-1111-1111-111111111111');
  const tokenB = await mint(keysB.privateKey, 'key-b', ISSUER_B, '22222222-2222-2222-2222-222222222222');
  // Signed by A's key but CLAIMING B's issuer — the forged-routing attack.
  const forged = await mint(keysA.privateKey, 'key-a', ISSUER_B, '11111111-1111-1111-1111-111111111111');

  await seedTenant(DB_A, 'TENANT-A-PRODUCT');
  await seedTenant(DB_B, 'TENANT-B-PRODUCT');

  // --- Boot the real API with both tenants ---------------------------------
  const api = spawn('node', ['dist/main.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      DATABASE_SSL: 'false',
      TENANTS: 'a,b',
      TENANT_A_ISSUER: ISSUER_A,
      TENANT_A_SUPABASE_URL: `http://localhost:${PORT_A}`,
      TENANT_A_SERVICE_ROLE_KEY: 'service-key-a',
      TENANT_A_DB_URL: DB_A,
      TENANT_A_DOMAINS: 'a.localhost',
      TENANT_B_ISSUER: ISSUER_B,
      TENANT_B_SUPABASE_URL: `http://localhost:${PORT_B}`,
      TENANT_B_SERVICE_ROLE_KEY: 'service-key-b',
      TENANT_B_DB_URL: DB_B,
      TENANT_B_DOMAINS: 'b.localhost',
      CRON_SECRET: 'test-cron-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const apiLog = [];
  api.stdout.on('data', (d) => apiLog.push(d.toString()));
  api.stderr.on('data', (d) => apiLog.push(d.toString()));
  cleanup.push(async () => api.kill());

  if (!(await waitForApi())) {
    console.error('API failed to start. Output:\n' + apiLog.join(''));
    process.exit(1);
  }

  const call = (path, opts = {}) => fetch(`http://localhost:${API_PORT}${path}`, opts);
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });

  console.log('--- each tenant sees only its own data ---');
  {
    const a = await (await call('/api/loan-products/active', { headers: bearer(tokenA) })).json();
    const b = await (await call('/api/loan-products/active', { headers: bearer(tokenB) })).json();
    check("tenant A's token returns tenant A's product", a?.name === 'TENANT-A-PRODUCT', `got ${a?.name}`);
    check("tenant B's token returns tenant B's product", b?.name === 'TENANT-B-PRODUCT', `got ${b?.name}`);
    check('the two tenants returned different data', a?.name !== b?.name);
  }

  console.log('');
  console.log('--- forged routing is rejected ---');
  {
    // Signed by A, claiming B's issuer. Routing sends it to B; B's key set
    // cannot verify A's signature. This is the property that makes the
    // unverified decode in TenantResolverMiddleware safe.
    const res = await call('/me', { headers: bearer(forged) });
    check("a token claiming another tenant's issuer is rejected", res.status === 401, `got ${res.status}`);

    const unknown = await mint(keysA.privateKey, 'key-a', 'http://localhost:9999/auth/v1', 'x');
    const res2 = await call('/me', { headers: bearer(unknown) });
    check('a token from an entirely unknown issuer is rejected', res2.status === 401, `got ${res2.status}`);

    const res3 = await call('/me', { headers: { Authorization: 'Bearer not-a-jwt' } });
    check('a malformed token is rejected', res3.status === 401, `got ${res3.status}`);
  }

  console.log('');
  console.log('--- public routes are scoped by host, not defaulted ---');
  {
    const a = await (await call('/api/loan-products/active', { headers: { Origin: 'http://a.localhost' } })).json();
    const b = await (await call('/api/loan-products/active', { headers: { Origin: 'http://b.localhost' } })).json();
    check("tenant A's origin returns tenant A's product", a?.name === 'TENANT-A-PRODUCT', `got ${a?.name}`);
    check("tenant B's origin returns tenant B's product", b?.name === 'TENANT-B-PRODUCT', `got ${b?.name}`);

    const unknown = await call('/api/loan-products/active', { headers: { Origin: 'http://nobody.localhost' } });
    // 403 from CORS (which fires first for a cross-origin request) or 404 from
    // tenant resolution — either is a refusal. What must NOT happen is a 200,
    // or a 500 (which would also page someone via Sentry).
    check(
      'an unrecognised origin is refused rather than defaulted',
      unknown.status === 403 || unknown.status === 404,
      `got ${unknown.status}`,
    );
  }

  console.log('');
  console.log('--- concurrency: AsyncLocalStorage must not leak across requests ---');
  {
    // The classic failure mode for this pattern, and invisible to
    // single-request testing: interleave many A and B requests on one process
    // and confirm every response matches its own tenant.
    const rounds = 40;
    const calls = [];
    for (let i = 0; i < rounds; i++) {
      calls.push(
        call('/api/loan-products/active', { headers: bearer(tokenA) })
          .then((r) => r.json())
          .then((j) => ({ want: 'TENANT-A-PRODUCT', got: j?.name })),
      );
      calls.push(
        call('/api/loan-products/active', { headers: bearer(tokenB) })
          .then((r) => r.json())
          .then((j) => ({ want: 'TENANT-B-PRODUCT', got: j?.name })),
      );
    }
    const results = await Promise.all(calls);
    const crossed = results.filter((r) => r.want !== r.got);
    check(
      `${rounds * 2} interleaved requests each stayed on their own tenant`,
      crossed.length === 0,
      crossed.length ? `${crossed.length} crossed, e.g. wanted ${crossed[0].want} got ${crossed[0].got}` : '',
    );
  }

  console.log('');
  console.log('--- no tenant, no service ---');
  {
    // A request the registry cannot place must fail, never fall back.
    const res = await call('/api/loan-products/active', { headers: { Host: 'unroutable.example' } });
    check('an unroutable request is refused', res.status === 404 || res.status >= 400, `got ${res.status}`);
  }

  console.log('');
  console.log('--- cron sweep spans every tenant, with per-tenant isolation ---');
  {
    const res = await call('/internal/cron/notification-sweep', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const body = await res.json();
    check('sweep succeeds with all tenants healthy', res.status === 200, `got ${res.status}`);
    check('sweep reports every tenant', (body?.tenants ?? []).length === 2, `got ${(body?.tenants ?? []).length}`);
    check('sweep reports per-tenant counts, not just ok', body?.tenants?.every((t) => t.created), '');
    check('sweep is rejected without the cron secret', (await call('/internal/cron/notification-sweep', { method: 'POST' })).status === 401);
  }

  console.log('');
  console.log('--- one tenant failing must not abort the others ---');
  {
    // A second instance where tenant B's database does not exist. Tenant A
    // must still be swept, and the overall response must be non-2xx so the
    // scheduled caller fails loudly rather than reporting a green 200.
    const brokenPort = 3197;
    const broken = spawn('node', ['dist/main.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(brokenPort),
        DATABASE_SSL: 'false',
        CRON_SECRET: 'test-cron-secret',
        TENANTS: 'a,b',
        TENANT_A_ISSUER: ISSUER_A,
        TENANT_A_SUPABASE_URL: `http://localhost:${PORT_A}`,
        TENANT_A_SERVICE_ROLE_KEY: 'k',
        TENANT_A_DB_URL: DB_A,
        TENANT_A_DOMAINS: 'a.localhost',
        TENANT_B_ISSUER: ISSUER_B,
        TENANT_B_SUPABASE_URL: `http://localhost:${PORT_B}`,
        TENANT_B_SERVICE_ROLE_KEY: 'k',
        TENANT_B_DB_URL: 'postgresql://prdf_test_owner:prdf_owner_pw@localhost:5432/does_not_exist',
        TENANT_B_DOMAINS: 'b.localhost',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    cleanup.push(async () => broken.kill());
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://localhost:${brokenPort}/health`)).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    const res = await fetch(`http://localhost:${brokenPort}/internal/cron/notification-sweep`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const body = await res.json();
    const tenants = body?.tenants ?? body?.message?.tenants ?? [];
    const a = tenants.find((t) => t.slug === 'a');
    const b = tenants.find((t) => t.slug === 'b');

    check('a broken tenant does not abort the healthy one', a?.ok === true, `tenant a: ${JSON.stringify(a)}`);
    check('the broken tenant is reported as failed', b?.ok === false, `tenant b: ${JSON.stringify(b)}`);
    check('a partial failure returns non-2xx, not a green 200', res.status >= 500, `got ${res.status}`);
  }

  console.log('');
  console.log(`passed=${passed} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error(err);
    failed++;
  })
  .finally(async () => {
    for (const fn of cleanup.reverse()) await fn();
    process.exit(failed > 0 ? 1 : 0);
  });
