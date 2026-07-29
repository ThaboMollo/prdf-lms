# Multi-tenant implementation spec — shared API, database per tenant

Written 2026-07-29, from an audit of the live code. Every "current state" claim has a file reference.

---

## 0. This is a deliberate departure from the platform spec

`platform-architecture-design.md` §3.3 specifies *"one NestJS application… **single-tenant per deployment**"* and §1 *"no shared runtime and no `tenant_id` column."* This document supersedes that for the API and frontend runtime. It is a considered change, not drift, and the reasoning should stay visible to whoever reads both.

**Driver:** deployment overhead. Today each client needs **four** cloud resources — a Supabase project plus three Vercel projects (API, admin-ui, client-ui). Onboarding is the 11-step §8 runbook, per client, forever.

**What is kept:** one database per tenant. Data isolation stays *physical*. There is no `tenant_id`, no shared tables, and no query that could return another tenant's rows because it never holds a connection to their database.

**What changes:** one API deployment serves all tenants by routing each request to that tenant's database. Frontends resolve their tenant at runtime from the hostname instead of at build time.

**Result:** per client goes from 4 cloud resources to **1 Supabase project + 1 DNS record**. No Vercel project, no deploy, no rebuild.

### Why not a shared database with `tenant_id`

It was considered and rejected. It would require `tenant_id` on 21 tables, all 49 RLS policies rewritten, and every query tenant-scoped — where a single miss is a cross-tenant data leak in a loan book. Database-per-tenant delivers the operational win that actually motivated this while leaving isolation structurally guaranteed. It also keeps the existing 49 policies and the pgTAP suite (`infra/supabase/tests/`) valid **unchanged**, which is a large amount of verified security work that would otherwise be thrown away.

---

## 1. Tenant identity

The single most important decision here: **how the API decides which tenant a request belongs to.** Get this wrong and it becomes the cross-tenant breach that database-per-tenant was chosen to prevent.

### 1.1 Authenticated requests — from the JWT issuer

Every Supabase project has a unique issuer and its own JWKS:

```
issuer:   https://kjhibiawvvmzhdjbqhpq.supabase.co/auth/v1
jwks_uri: https://kjhibiawvvmzhdjbqhpq.supabase.co/auth/v1/.well-known/jwks.json
```

The flow:

1. Decode the token **without verifying** to read `iss`. (Safe: this only selects a key set.)
2. Look up the tenant whose issuer matches. Unknown issuer → **401**, no fallback, no default tenant.
3. Verify the signature against **that tenant's** JWKS.
4. Bind the resolved tenant to the request context.

This is cryptographic, not client-asserted. A forged `iss` routes to a key set that will not verify the signature. There is no header a caller can set to change tenant.

**Never** resolve tenant for an authenticated request from a header, query parameter, or request body. Those are attacker-controlled.

### 1.2 Unauthenticated requests — from Origin

One route is public: `GET /api/loan-products/active` (backs the logged-out marketing calculator). It has no token, so tenant comes from the `Origin`/`Host` header matched against the registry's domain list. Unknown origin → 404, not a default.

This is client-assertable, which is acceptable only because the data is already public for that tenant. **No authenticated route may ever use this path.** Enforce with a test, not a convention.

---

## 2. Tenant registry

Two halves, split by trust boundary. This split is mandatory:

### 2.1 Public config — `packages/tenant-config` (unchanged in nature)

Branding, theme tokens, copy, feature flags. Already exists; `prdf.ts` and `kgolo.ts` are both present.

**This is bundled into browser JavaScript** (`client-ui/src/main.tsx:12`, `admin-ui/src/main.tsx:11`). **No infrastructure secret may ever be added to it.** Add a lint/CI check asserting no key matching `/KEY|SECRET|PASSWORD|CONNECTION/i` appears anywhere under `packages/tenant-config`.

Additions needed: `slug`, and `domains: string[]` (the hostnames this tenant serves) for §1.2 and §6.

### 2.2 Private config — server-side only

Never in git, never in the bundle. Read from environment at boot:

```
TENANTS=prdf,kgolo

TENANT_PRDF_ISSUER=https://kjhibiawvvmzhdjbqhpq.supabase.co/auth/v1
TENANT_PRDF_SUPABASE_URL=https://kjhibiawvvmzhdjbqhpq.supabase.co
TENANT_PRDF_SERVICE_ROLE_KEY=...
TENANT_PRDF_DB_URL=postgresql://...pooler.supabase.com:6543/postgres

TENANT_KGOLO_ISSUER=...
```

A `TenantRegistryService` parses these at boot, validates each entry with zod, and **fails startup loudly** if any tenant in `TENANTS` is missing a field. A half-configured tenant must not boot — a tenant silently falling back to another tenant's connection is the worst possible failure.

Expose lookups by `issuer`, `slug`, and `domain`. Never expose the whole record to request handlers.

---

## 3. Workstreams

### W1 — Tenant context

`backend-node/src/database/rls-context.ts` already has `AsyncLocalStorage<PoolClient>`. Extend to carry the tenant:

```ts
export const requestContext = new AsyncLocalStorage<{
  tenant: ResolvedTenant
  client?: PoolClient      // set by RlsTransactionInterceptor
}>()
```

Anything that reaches for a database connection, a Supabase URL, or a service-role key gets it from here — never from `process.env` directly. That rule is what makes the rest safe.

### W2 — `DatabaseService` becomes tenant-aware

Today (`database.service.ts:10-27`) it builds **one** pool from `SUPABASE_DB_CONNECTION_STRING` at `onModuleInit`.

Becomes a pool **per tenant**, created lazily and cached:

- Keep `max: 3` per pool. The existing comment explains why: Supavisor, not this pool, protects Postgres. That reasoning holds and matters more now — worst case is `instances × tenants × 3`.
- **Bound the cache** (LRU, evict idle pools) so a serverless instance touching many tenants doesn't accumulate unbounded pools.
- `currentClient()` resolves via `requestContext`, not a field.
- **Throw if there is no tenant in context.** No default pool. A missing tenant must be a loud failure, never a silent fallback to whichever tenant happens to be first.

### W3 — Auth guard becomes tenant-aware

`supabase-auth.guard.ts:36` caches **one** module-scope `jwks`. Becomes a `Map<issuer, JWKSet>`, populated from the registry.

Implement §1.1 exactly: unverified decode for `iss` → registry lookup → verify against that key set → bind tenant. Unknown issuer is 401 *before* any database work.

Everything else in the guard is unchanged: roles still re-derived from that tenant's database (never from claims), `aal` still read for MFA (§6.5).

### W4 — Service-role calls

`clients.service.ts`, `applications.service.ts`, `documents.service.ts` read `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (signed upload/download URLs, admin auth calls). All must take them from the tenant in context.

This is the highest-risk edit in the spec: a missed call site mints a signed URL against the **wrong tenant's storage bucket**. Enforce with a CI grep — `process.env.SUPABASE_(URL|SERVICE_ROLE_KEY|DB_CONNECTION_STRING)` must not appear outside the registry, matching the existing anti-`.from(` grep pattern.

### W5 — Cron sweep

`POST /internal/cron/notification-sweep` currently sweeps one database. It must iterate all tenants, each in its own context, with **per-tenant error isolation** — one tenant's failure must not abort the others. Return a per-tenant summary so a partial failure is visible rather than a silent 200.

(Related: this endpoint was silently a no-op for months — see the `X1` incident in the tracker. Whatever replaces it needs an assertion that it actually did work, not just that it returned 200.)

### W6 — Migrations across N databases

The chain in `infra/supabase/migrations/` currently targets one project. Needs `infra/scripts/migrate-all.ts`:

- Apply pending migrations to every tenant in the registry.
- **Report drift** — a tenant on a different migration than the rest is the thing that ends "byte-identical schema" and must be visible immediately.
- Fail the whole run loudly on any tenant's failure; never leave the fleet half-migrated silently.
- Verified reproducibility already exists: the chain applies cleanly to a fresh database (proved while building `infra/supabase/tests/`), so a new tenant's DB is deterministic.

### W7 — Frontends resolve tenant at runtime

**This is the workstream that actually removes the deployment overhead.** Without it, the shared API only takes each client from 4 cloud resources to 3.

Today: 11 hardcoded `tenants/prdf` imports; `kgolo.ts` is unreachable; `TENANT_ID` exists nowhere.

Change to hostname-based runtime resolution:

- `packages/tenant-config/index.ts` exports `resolveTenantByDomain(hostname)` over a registry of all tenants.
- `main.tsx` resolves at startup and applies theme via the existing `applyTenantTheme`.
- `GlobalLoader` (in `packages/ui-kit`) currently imports `prdf` directly — must take the tenant as a prop or from context.
- Unknown hostname → a clear "unrecognised domain" screen, not a default tenant.

Cost: all tenants' branding config ships in every bundle. For a handful of tenants that is kilobytes. Revisit past ~20 tenants.

**One Vercel project per app, serving all tenant domains.** Adding a client becomes: add a config entry, add the domain in Vercel, point DNS.

### W8 — Observability

Tag every Sentry event with the tenant (`Sentry.setTag('tenant', slug)`) inside the request context, and include the slug in log lines. Without this, one tenant's error storm is indistinguishable from another's — and the API is now a shared failure domain.

---

## 4. Invariants — must not regress

1. **No `tenant_id` column, ever.** Isolation stays physical. If someone proposes a shared table "just for X", that is the moment this architecture becomes the thing we rejected in §0.
2. **Roles re-derived from the tenant's database per request**, never trusted from JWT claims (spec §6.8).
3. **RLS stays live behind the API** — the transaction-scoped `set_config('request.jwt.claims', …)` + `set local role authenticated` path is unchanged, now against the tenant's pool.
4. **The 49 existing policies and the 16 pgTAP assertions remain valid unchanged.** If a change would require rewriting them, it is out of scope for this spec.
5. **No default tenant, anywhere.** Every unresolved tenant is a hard failure.

---

## 5. Isolation testing

This is the price of admission. Shared-API introduces exactly one new breach class — wrong-tenant resolution — and it must be tested directly, not reasoned about.

New suite, two live tenants (a scratch pair, not production):

| Assertion |
|---|
| Tenant A's token against a Tenant B resource → 401/404, never data |
| Tenant A's token with `iss` rewritten to Tenant B → 401 (signature fails against B's JWKS) |
| Unknown issuer → 401, and no database connection is opened |
| A request with **no** tenant resolvable → hard failure, never a default pool |
| Public `loan-products/active` from Tenant A's origin returns A's product, never B's |
| A signed upload/download URL minted under Tenant A points at A's bucket |
| Concurrent A and B requests on one instance don't cross pools (`AsyncLocalStorage` leak check) |
| Cron sweep touches every tenant, and one tenant's failure doesn't abort the rest |

The concurrency assertion matters most: `AsyncLocalStorage` context leaking across concurrent requests is the classic way this pattern fails, and it will not show up in single-request testing.

Wire into CI alongside the existing `rls-tests` job.

---

## 6. What gets worse — accept these knowingly

Today's isolation-per-deployment gives properties that are genuinely lost:

| Property | Today | After |
|---|---|---|
| API outage | One client | **Every client** |
| Bad deploy | One client | **Every client, simultaneously** |
| Cross-tenant leak via API bug | Structurally impossible | Possible — mitigated by §1.1 and §5 |
| Noisy neighbour | None | Shared function concurrency |
| Per-client rollback | Independent | Not possible without a per-tenant flag |

Mitigations worth budgeting for: staged rollout (deploy to a canary tenant's domain first), per-tenant feature flags in tenant config, and alerting that distinguishes one-tenant from all-tenant failures.

Data isolation itself is unchanged — that is the point of database-per-tenant.

---

## 7. Sequencing

Each step ships independently and leaves the app working. Steps 1–4 are invisible to users.

1. **W1 + W2 registry & context, single tenant.** Introduce the registry and context with only `prdf` configured. Prove nothing changes.
2. **W3 auth guard** by issuer, still one tenant. Prove the existing login still works end to end.
3. **W4 service-role call sites** + the CI grep. Highest-risk edit; do it while there is still only one tenant, so a mistake is harmless.
4. **W6 migrate-all**, still one tenant. Now a second database can be created reproducibly.
5. **Add a second scratch tenant + W5 isolation suite.** Do not proceed until every assertion passes. This is the gate.
6. **W5 cron** across tenants.
7. **W7 frontends** — runtime resolution. The deployment-overhead win lands here.
8. **W8 observability**, then onboard `kgolo` for real.

Step 5 is a genuine gate, not a checkpoint. Onboarding a second real tenant before the isolation suite passes means finding out about a resolution bug from a client rather than from CI.

---

## 8. Prerequisites

Not optional, and not part of this spec's scope:

- **The `service_role` key is currently live in a public git repo, and the storage bucket is public.** Under this architecture the API holds *every* tenant's service-role key. Rotate and lock down before adding a second tenant, or one compromise becomes N.
- **D1 — IP ownership / client 1 exclusivity** (spec §10.1) blocks any second-client deployment regardless of architecture. Legal, not technical.
- **D3 — region per tenant** (§10.6). With per-tenant databases this stays flexible, which is an advantage worth keeping: a shared database would have forced one region for everyone.
- The current tenant should be verifiably healthy first — the `jose` fix and `VITE_API_BASE_URL` correction still need deploying.
