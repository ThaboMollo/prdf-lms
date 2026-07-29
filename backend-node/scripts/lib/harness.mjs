/**
 * Shared integration-test harness.
 *
 * Boots the REAL API process against a REAL Postgres database, authenticated
 * with REAL ES256-signed tokens verified against a mock JWKS issuer standing in
 * for Supabase Auth. Nothing is stubbed — a passing test means the deployed
 * code behaves, not that a mock did.
 *
 * Extracted from test-tenant-isolation.mjs so the isolation gate and the API
 * integration suite share one implementation. Test infrastructure duplicated
 * across suites is exactly the kind that rots quietly.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { Client } = require('pg');

/** Tracks everything that must be torn down, in reverse order. */
export function createCleanup() {
  const fns = [];
  return {
    add: (fn) => fns.push(fn),
    async run() {
      for (const fn of fns.reverse()) {
        try {
          await fn();
        } catch {
          /* teardown is best-effort */
        }
      }
    },
  };
}

/** A mock Supabase Auth issuer serving one key at the real JWKS path. */
export async function startIssuer({ port, kid = 'test-key' }) {
  const keys = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(keys.publicKey)), alg: 'ES256', use: 'sig', kid };

  const server = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(port, resolve));

  const issuer = `http://localhost:${port}/auth/v1`;

  return {
    issuer,
    supabaseUrl: `http://localhost:${port}`,
    close: () => new Promise((r) => server.close(r)),
    /** Mint a token this issuer's key set will verify. */
    mint: (sub, claims = {}) =>
      new SignJWT({ role: 'authenticated', ...claims })
        .setProtectedHeader({ alg: 'ES256', kid })
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(keys.privateKey),
  };
}

/**
 * Newest mtime under a directory, or 0 if it doesn't exist.
 * Shallow-recursive and cheap; these trees are small.
 */
function newestMtime(dir) {
  let newest = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

/**
 * Refuse to run against a stale build.
 *
 * The suites boot `dist/main.js`, not the TypeScript sources. CI builds first,
 * but a local run does not — so editing a source file and immediately running
 * the suite silently tests the PREVIOUS build. That is a vacuous pass: green
 * output that says nothing about the change you just made. It has already
 * cost one debugging cycle on this project.
 */
function assertBuildIsFresh(cwd) {
  const entrypoint = join(cwd, 'dist/main.js');
  if (!existsSync(entrypoint)) {
    throw new Error(`No build found at ${entrypoint}. Run: npm run build`);
  }

  // Compare against tsconfig.tsbuildinfo, not against the emitted .js files.
  // The build is incremental: if a source file's content is unchanged, tsc
  // skips re-emitting it and dist/ keeps its older mtime — so comparing to
  // dist/ reports stale on a build that is actually current. tsbuildinfo is
  // rewritten on every successful build regardless of what was emitted, which
  // makes it the honest marker of "when did a build last complete".
  const buildInfo = join(cwd, 'dist/tsconfig.tsbuildinfo');
  if (!existsSync(buildInfo)) {
    // Some build configurations don't emit it; skipping the check is better
    // than failing every run on an environment we can't reason about.
    return;
  }

  const srcTime = newestMtime(join(cwd, 'src'));
  const builtAt = statSync(buildInfo).mtimeMs;

  if (srcTime > builtAt) {
    throw new Error(
      'src/ has changed since the last build — this run would test the PREVIOUS build,\n' +
        'not your changes, and pass or fail for the wrong reason.\n' +
        'Run: npm run build',
    );
  }
}

/** Boot the compiled API. Resolves once /health answers. */
export async function bootApi({ port, env, cwd }) {
  assertBuildIsFresh(cwd);

  const proc = spawn('node', ['dist/main.js'], {
    cwd,
    env: { ...process.env, PORT: String(port), DATABASE_SSL: 'false', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = [];
  proc.stdout.on('data', (d) => log.push(d.toString()));
  proc.stderr.on('data', (d) => log.push(d.toString()));

  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/health`)).ok) {
        return { proc, log, baseUrl: `http://localhost:${port}`, kill: () => proc.kill() };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(`API did not start on :${port}\n${log.join('')}`);
}

/** Run SQL against a database, returning rows. */
export async function withDb(connectionString, fn) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Minimal pass/fail recorder shared by the suites. */
export function createRecorder() {
  let passed = 0;
  let failed = 0;
  return {
    get passed() {
      return passed;
    },
    get failed() {
      return failed;
    },
    check(name, condition, detail = '') {
      if (condition) {
        passed++;
        console.log(`ok     | ${name}`);
      } else {
        failed++;
        console.log(`NOT OK | ${name}${detail ? ` — ${detail}` : ''}`);
      }
    },
    section(title) {
      console.log('');
      console.log(`--- ${title} ---`);
    },
    summary() {
      console.log('');
      console.log(`passed=${passed} failed=${failed}`);
      return failed === 0;
    },
  };
}
