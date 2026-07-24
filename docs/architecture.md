# Architecture

This document reflects the current state of the codebase after Phase 0, Phase 1, Phase 2, and Phase 3a of `platform-architecture-design.md` (repo root — the full 7-phase target-state spec and implementation roadmap; read that for anything not covered here). `docs/system-overview.md` remains the verified reference for pre-Phase-0 behaviour and is kept as historical record, not updated going forward.

**Phase 3a note**: the full Phase 3 ("make the API the only data path") turned out to be 3–4x the size of Phase 2 once researched — both frontends still talk directly to Supabase today, unchanged. Phase 3a is the backend-internal subset that doesn't touch either frontend: local JWT validation, RLS-behind-API, Supavisor pooling, Vercel serverless deployment, and the notification-sweep cron port. Frontend repointing (35–45 files), OpenAPI/`packages/api-client` generation, and request validation remain unstarted, separately-scoped follow-up work.

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
infra/supabase/
  migrations/      Supabase-CLI-managed migrations. 20260723180000_baseline
                    (squashed from 18 hand-maintained "phase" patch files) +
                    20260724120000 (Phase 2: loan_products/document_requirements
                    columns, the approval verification gate) — see each
                    file's header comment for what changed
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
- **Vercel serverless deployment**: `backend-node/api/index.ts` exports the underlying Express instance directly (no adapter library needed for Vercel specifically — those exist mainly for AWS Lambda's proxy-integration format), cached across warm invocations. `vercel.json` added with a catch-all rewrite and the cron schedule.
- **Cron**: `POST|GET /internal/cron/notification-sweep`, guarded by a `CRON_SECRET` bearer check (deliberately separate from `SupabaseAuthGuard`), replacing `@nestjs/schedule`'s in-process job (removed entirely, along with the `@nestjs/schedule`/`cron` dependencies). Accepts both HTTP methods since Vercel's own documentation is inconsistent about which one Cron actually sends. Verified the sweep's actual SQL logic still produces correct notifications with correct same-day deduplication, not just that the endpoint responds.
- Found and fixed in passing: `backend-node/dist/` was mistakenly committed to git (unlike `client-ui`/`admin-ui`'s gitignored `dist/`) — untracked and added to `.gitignore`. Consolidated three duplicated role-derivation SQL queries into one shared `fetchUserRoles()` helper.

## What's still open

Phase 3's frontend-repointing work (35–45 files: 15 Supabase adapters to delete, 15 repos to simplify, 12 API adapters with stub methods to fill in, a `loans.api.ts` to build from scratch, 7 call sites that bypass the repo pattern entirely), OpenAPI generation and `packages/api-client` (blocked on DTOs — every controller currently takes `body: any`), request validation, and a committed test suite (none exists yet) are all unstarted. Phases 4 through 6 (extracting shared `packages/*` beyond `tenant-config`, provisioning client 2, operational readiness) haven't been touched. Several are explicitly blocked on human decisions the implementing agent was told not to resolve unilaterally — see `platform-architecture-design.md` §10 for the current list.

**Manual verification still needed against the real project** (not done by the implementing agent — no access): the actual Supavisor pooler connection (only the transaction-local `set_config` mechanism was verified, against a local Postgres standing in for it), and a real Vercel deployment of `backend-node` (the serverless entry point was verified to build and type-check correctly, not deployed).
