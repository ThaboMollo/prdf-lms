# Architecture

This document reflects the current state of the codebase after Phase 0, Phase 1, Phase 2, Phase 3a, and the first pass of full Phase 3 of `platform-architecture-design.md` (repo root — the full 7-phase target-state spec and implementation roadmap; read that for anything not covered here). `docs/system-overview.md` remains the verified reference for pre-Phase-0 behaviour and is kept as historical record, not updated going forward.

**Phase 3, first pass note**: full Phase 3 ("make the API the only data path") is large — closing `backend-node`'s endpoint/validation/OpenAPI gaps, then repointing 35–45 frontend files, then deleting `VITE_DATA_PROVIDER`. This pass is the first half only: `backend-node` API completeness (endpoint coverage, request validation, OpenAPI + `packages/api-client` generation, the status-transition DB trigger). **No frontend changes** — both frontends still default to `VITE_DATA_PROVIDER=supabase`, unchanged. Frontend repointing remains unstarted, separately-scoped follow-up work.

## What this is

A single loan origination and servicing platform, one codebase, deployed independently per client (client 1 = PRDF, client 2 = Kgolo). Every client gets their own Supabase project, database, storage bucket, auth user pool, and frontend/API deployments — there is no shared runtime and no `tenant_id` column. Client differences live in configuration and data (`packages/tenant-config`, once Phase 4 lands), never in forked code.

## Current repository shape (post Phase 2)

```
client-ui/        React 19 + Vite SPA, client-facing
admin-ui/         React 19 + Vite SPA, staff-facing
backend-node/     NestJS 10 — the sole backend implementation (the parallel
                   ASP.NET Core implementation was deleted in Phase 1)
packages/
  tenant-config/   Plain TypeScript, not a workspace package yet (see its
                    schema.ts header) — per-client branding/copy/feature
                    flags/eligibility criteria. tenants/prdf.ts is wired into
                    both apps; tenants/kgolo.ts exists but is intentionally
                    incomplete (client 2 isn't provisioned yet, Phase 5)
  api-client/      Typed HTTP client generated from backend-node's OpenAPI
                    spec (openapi-typescript for types + a hand-written
                    generic fetch wrapper, matching the existing hand-rolled
                    api.ts style in both frontends rather than a full codegen
                    tool). Plain TypeScript, no workspace tooling — same
                    precedent as tenant-config. Nothing imports it yet;
                    frontend repointing is separately-scoped follow-up work.
                    Request bodies are genuinely typed; response bodies are
                    not yet (see its client.ts header for why).
infra/supabase/
  migrations/      Supabase-CLI-managed migrations. 20260723180000_baseline
                    (squashed from 18 hand-maintained "phase" patch files) +
                    20260724120000 (Phase 2: loan_products/document_requirements
                    columns, the approval verification gate) +
                    20260724180000 (Phase 3: general status-transition graph
                    trigger) — see each file's header comment for what changed
  seed/            Role catalogue + notification templates, applied after
                    the baseline on every fresh tenant
  tests/           pgTAP RLS assertion suite (not yet populated — Phase 0
                    scaffolding only; the suite itself is unfinished work)
docs/              This file, system-overview.md, and product/support docs
```

`backend-node/railway.toml` and `Dockerfile` are still present as a deliberate, temporary exception to the target-state spec — they're deleted only once Phase 3 actually ships the NestJS-as-Vercel-Functions replacement, to avoid a window with zero deployment path for the API.

## The database is the business rule engine

The schema, its triggers, and its RLS policies are the most valuable asset in this system and stay in Postgres — business logic is not moved into the API layer. Every client runs a byte-identical schema from `infra/supabase/migrations/`; a client-specific need becomes a migration behind a feature flag or config row, applied to every tenant, never a schema fork.

Key enforcement points, all in the database, not application code:
- **Role resolution**: always re-derived from `user_roles`/`roles` at query time via `is_in_role()`, never trusted from JWT claims.
- **Document submission gate**: a trigger blocks any transition into `Submitted` status if required documents (per the application's `loan_products` row, via `document_requirements`) are missing, regardless of which actor or code path performs the update.
- **Approval verification gate** (Phase 2): a trigger blocks any transition into `Approved` unless every required document is marked `Verified`, not just present. Previously, verification status was tracked but never enforced.
- **Document immutability**: uploaded document rows can't have their core fields altered after insert — only verification metadata.
- **Loan amount/term/rate**: per-product, via `loan_products.min_amount`/`max_amount`/`min_term_months`/`max_term_months`/`interest_rate` — a trigger validates against the application's linked product (not a plain CHECK constraint, since that can't reference another table), exempted while an application is a `Draft` so wizard autosave of partial data doesn't fail.
- **RLS coverage**: all tenant-sensitive tables have row-level security, including `loans`/`disbursements`/`repayments`/`repayment_schedule` — these four had no RLS at all before Phase 0's baseline squash closed that gap. `loan_products` is also `anon`-readable (for `is_active = true` rows only) since its rate/limits were already public marketing copy before Phase 2.

## Data access — current state, not yet the target state

**This has not changed through Phase 3a.** Both frontends still default to `VITE_DATA_PROVIDER=supabase`, talking directly to Supabase (PostgREST + Storage) with RLS as the authorization boundary — Phase 3a hardened `backend-node` itself but didn't repoint either frontend to use it. The target architecture — the API as the *only* data path, with RLS kept live behind it as a second independent layer — needs the frontend-repointing work (still unstarted) before it's actually true end-to-end. `backend-node` is now capable of the target's security model (see below); nothing calls it yet in production.

## What Phase 0 + Phase 1 actually did

- Squashed 18 hand-maintained SQL patch files into one Supabase-CLI-managed baseline migration, fixing a defect where the Non-Financial Support RLS policies referenced a function (`current_user_has_role`) that was never defined anywhere — those policies would have failed at creation time on a fresh database.
- Added RLS policies to `loans`, `disbursements`, `repayments`, and `repayment_schedule` — a gap present in the old chain and not mentioned in the platform spec, found and closed during the squash.
- Deleted the redundant ASP.NET Core backend (`backend/`), `docker-compose.yml`, dead `ProtectedRoute` components in both frontends, and the Azure/Railway deployment tooling that only served the deleted backend.
- Rewrote CI to build `backend-node` instead of the deleted `.NET` solution.

## What Phase 2 actually did

- Added rate/amount/term columns to `loan_products` and wired `document_requirements` into the two DB triggers that used to hardcode a 10-item document list — one canonical, product-scoped source of truth instead of the trigger's hardcoded array.
- Found and fixed a live bug while doing this: the required-document list had drifted into **four independent, inconsistent copies** across the codebase (a DB trigger, and three separate frontend arrays with different labels — one with a `multiple` upload flag the others lacked). All four now derive from `document_requirements`.
- Added the document-verification approval gate (the human decision that unblocked this phase) — both as a DB trigger and as a faster, friendlier application-level pre-check in `admin-ui`'s approval code path.
- Built `packages/tenant-config` (plain TypeScript, no workspace tooling — see its `schema.ts` header for why) with a real config for client 1 (`tenants/prdf.ts`) covering colours, logo, the eligibility checklist, and feature flags, wired into both apps at startup. `tenants/kgolo.ts` exists but is intentionally incomplete (missing `eligibility`) since client 2 isn't provisioned yet.
- Wired two feature flags to actually gate rendering for the first time: the Non-Financial Support tab (`admin-ui`) and the BEE/impact demographic fields (`client-ui`'s application wizard) — previously always-on with no toggle at all.
- Deliberately **not** done this pass: full copy-dictionary extraction (120+ strings in the application wizard alone) and making the wizard's step order genuinely data-driven (it's a hand-rolled reducer, not a data loop) — both flagged as separate, larger follow-up work rather than bundled in.

## What Phase 3a actually did

`backend-node` gained the security/deployment infrastructure it had none of before — all backend-internal, verified without touching either frontend:

- **Local JWT validation**: `SupabaseAuthGuard` now verifies tokens locally via `jose` against Supabase's JWKS endpoint (cached at module scope), instead of a remote `supabase.auth.getUser()` round-trip on every request. Requires the Supabase project to use asymmetric JWT signing keys — confirmed true for this project before relying on it.
- **RLS-behind-API**: a new `RlsTransactionInterceptor` opens a transaction per authenticated request, sets `request.jwt.claims`/`role authenticated` via `set_config`, and runs the request inside it (via `AsyncLocalStorage`, so every existing `this.db.query(...)` call in every service picked this up with zero changes to the services themselves). **Verified end-to-end against a real cross-tenant scenario**, not just reasoned about: a client requesting another client's application is now genuinely blocked by database-level RLS, not just application-code role checks — proven with real signed JWTs against a local test harness (mock JWKS server + scratch Postgres running the actual schema/RLS policies), including a concurrent-request test confirming no session-state leakage between simultaneous requests from different users.
- **Supavisor pooling**: connection string moved to the transaction-mode pooler (documented in `.env.example`); `Pool` max reduced from 10 to 3 per instance, since the pooler — not this local pool — is what should absorb concurrent serverless instances.
- **Vercel serverless deployment**: uses Vercel's zero-config NestJS framework preset — `src/main.ts` calls `NestFactory.create()` + `.listen()` directly (unchanged from local-dev shape; CORS/exception-filter config factored out into `create-app.ts`'s `configureApp()`, called from `main.ts` after construction), and Vercel wraps the whole app into a single Function automatically. No custom `api/index.ts` handler or `vercel.json` rewrite — an earlier pass added both, which broke deployment: Vercel's entrypoint detection statically scans `src/main.ts` for a literal `NestFactory.create()` call, and rejected the file once that call was factored out into a helper. Removed both files once the direct call was restored.
- **Cron**: `POST|GET /internal/cron/notification-sweep`, guarded by a `CRON_SECRET` bearer check (deliberately separate from `SupabaseAuthGuard`), replacing `@nestjs/schedule`'s in-process job (removed entirely, along with the `@nestjs/schedule`/`cron` dependencies). Accepts both HTTP methods since Vercel's own documentation is inconsistent about which one Cron actually sends. Verified the sweep's actual SQL logic still produces correct notifications with correct same-day deduplication, not just that the endpoint responds. **Triggered by `.github/workflows/notification-sweep.yml`, not Vercel Cron** — discovered during deployment that Vercel's Hobby tier only allows daily-or-less-frequent Cron Jobs, which doesn't cover the hourly schedule this needs. Mirrors the existing `uptime-check.yml` scheduled-workflow pattern already in this repo; needs `API_HEALTH_URL` (already in use) and a new `CRON_SECRET` GitHub secret set to the same value as the API's env var.
- Found and fixed in passing: `backend-node/dist/` was mistakenly committed to git (unlike `client-ui`/`admin-ui`'s gitignored `dist/`) — untracked and added to `.gitignore`. Consolidated three duplicated role-derivation SQL queries into one shared `fetchUserRoles()` helper.

## What Phase 3, first pass (backend completeness) actually did

Closed the gap between what `backend-node` could do and what both frontends currently do directly against Supabase — no frontend changes, verified with real signed JWTs against a scratch Postgres running the actual migration chain + RLS policies:

- **Request validation everywhere**: `class-validator`/`class-transformer`/`@nestjs/swagger` installed, a global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` wired in `create-app.ts`. Every controller method that used to take `@Body() body: any` (19 of them) now has a real DTO class under `src/<module>/dto/`.
- **A real correctness bug fixed, found while doing this**: `ApplicationsService` validated loan amount/term against hardcoded constants (`src/common/loan-limits.ts`, since deleted) and a hardcoded 10-item document array, while the database's own trigger had validated against the real `loan_products`/`document_requirements` tables since Phase 2. Worse: `ApplicationsService.create()` never set the new-in-Phase-2 `loan_product_id` column at all — since that column is `NOT NULL`, every application created through `backend-node` would have failed outright against the real post-Phase-2 schema. Fixed via a new `LoanProductsService`/`LoanProductsModule` (`GET /api/loan-products/active`) that both the applications flow and the trigger-mirroring validation now resolve against.
- **Draft-application parity**: `update()` now does a partial patch (matching wizard autosave — `monthlyRevenue`, `yearsInOperation`, `numberOfEmployees`, `bankName`, `currentStep`, `draftState`), with no amount/term validation while still `Draft` (mirroring the DB trigger's own Draft exemption exactly — validation now happens once, at the `Draft → Submitted` transition in `submit()`, not on every autosave). New `GET /api/applications/draft`, `POST /:id/consent`, `DELETE /:id`.
- **New endpoints closing frontend-parity gaps**: `GET /api/loans` (role-scoped list), document delete + signed-download-URL (`DELETE .../documents/:docId`, `GET .../documents/:docId/url`), three new report endpoints (`demographic`, `debtors-age`, `province`, ported from `admin-ui`'s Supabase-only SQL-in-JS logic), generalized admin role management (`POST/DELETE /api/admin/users/:userId/roles/:roleName` — was Admin-only before, now all 6 roles, with the last-holder/self-revoke protections extended to `SuperAdmin`), and a new `UsersController` (`GET /api/users/assignable`, `GET /api/users/profiles?ids=`) replacing inline Supabase queries that lived directly in `admin-ui/src/pages/ApplicationsPage.tsx`.
- **Status-transition DB trigger** (`infra/supabase/migrations/20260724180000_status_transition_trigger.sql`): the decision from `platform-architecture-design.md` §10.4 ("yes, add a DB trigger"), scoped out of Phase 3a, finally built — a second, independent layer enforcing the exact same graph as `ApplicationsService`'s in-memory `LOAN_STATUS_TRANSITIONS` map. Verified directly against local Postgres: every legal edge succeeds, illegal jumps (e.g. `Draft → Approved`, `Closed → Disbursed`) are rejected, same-status no-ops are harmless.
- **`packages/api-client`**: `generate:openapi` npm script boots the Nest app in-process and writes `backend-node/openapi.json`; `openapi-typescript` generates types from it; a hand-written generic typed fetch client wraps them. Request-body typing is real and verified (a smoke test confirmed both valid and invalid bodies type-check correctly). Response-body typing is not yet real — no controller has an `@ApiResponse` decorator, so all 56 operations' success responses have no content schema in the generated spec. Documented as a known limitation in `client.ts`, deliberately deferred to the frontend-repointing pass where each response shape becomes a real call site.
- **Found and fixed during verification, not before**: `deleteApplication()` initially reused the general-access `ensureCanAccess` (staff-permissive) instead of matching the `applications delete own draft` RLS policy exactly (owning-client-only, no staff exception at all) — caught by a live test where an Admin JWT successfully deleted a client's draft application. Fixed to match the RLS policy precisely; added a defensive affected-row-count check to both this and `deleteDocument()` so a silently-blocked delete (e.g. by RLS) can no longer report false success.
- Also fixed in passing: `DatabaseService.onModuleDestroy()` crashed if the app was closed before `onModuleInit()` ran (exactly what `generate-openapi.ts`'s in-process boot does) — now guards against an uninitialized pool. Consolidated four more `getRoles()` duplicates found in `loans.service.ts`, `tasks.service.ts`, `nfs.service.ts`, and `reports.service.ts` into the shared `fetchUserRoles()` helper (on top of the one already fixed in Phase 3a).

## What's still open

Phase 3's frontend-repointing work (35–45 files: 15 Supabase adapters to delete, 15 repos to simplify, 12 API adapters with stub methods to fill in, a `loans.api.ts` to build from scratch, 7 call sites that bypass the repo pattern entirely) and deleting `VITE_DATA_PROVIDER` are unstarted — `packages/api-client` exists but nothing imports it yet. `packages/api-client`'s response-body typing (see above) and a committed test suite (none exists yet) are also open. Phases 4 through 6 (extracting shared `packages/*` beyond `tenant-config`, provisioning client 2, operational readiness) haven't been touched. Several are explicitly blocked on human decisions the implementing agent was told not to resolve unilaterally — see `platform-architecture-design.md` §10 for the current list.

**`backend-node` is now confirmed live on Vercel** (`prdf-api` project, commit `9936172`) — `/health` returns 200, `/me` returns a clean 401 for an invalid token (proving JWT verification actually runs against the real Supabase JWKS endpoint, not just that the function boots), `/internal/cron/notification-sweep` returns a clean 401 without the correct `CRON_SECRET`, and no runtime errors in production. Getting here required three fixes against real deployment attempts, in order: (1) a stale-commit issue — nothing had been pushed yet; (2) Vercel's zero-config NestJS entrypoint detection rejecting `src/main.ts` because Phase 3a had moved its `NestFactory.create()` call into a helper (fixed by restoring the direct call, and removing the now-unnecessary custom `api/index.ts` + `vercel.json`); (3) `jose` v6 is ESM-only with no `require` export condition — a static import compiled to `require('jose')` and crashed with `ERR_REQUIRE_ESM` on Vercel's runtime (worked locally only because that Node build tolerates synchronous `require(esm)`). Fixed with a `new Function('specifier', 'return import(specifier)')` indirection in `supabase-auth.guard.ts`, since a literal `await import('jose')` isn't sufficient either — `tsc` downlevels it back into a wrapped `require()` under CommonJS output.

**Still needed**: add `CRON_SECRET` as a GitHub Actions repository secret (same value as the Vercel env var) so `.github/workflows/notification-sweep.yml` can actually fire — untested end-to-end. A real cross-tenant RLS test against production data (not just the local test harness) hasn't been run.
