# LMS Platform Architecture and Implementation Specification

**Status**: Approved design, ready for implementation
**Audience**: Implementation agent and future maintainers
**Supersedes**: `docs/architecture.md`, `docs/system-specification.md`, `docs/api-spec.md`
**Source of truth for current behaviour**: `system-overview.md` (verified against source 2026-07-23)

---

## 0. How to read this document

This is a build specification, not a discussion document. Sections 1 through 4 define the target architecture. Section 5 defines what must be deleted. Sections 6 through 9 define the implementation phases with acceptance criteria. Section 10 lists decisions that require a human answer before the affected phase starts.

Where this document conflicts with any file under `docs/`, this document wins. The existing `docs/` folder is known to be materially inaccurate and is scheduled for deletion in Phase 0.

**Do not begin Phase 3 or later until Phase 0 through 2 acceptance criteria pass.** Phases are sequenced deliberately; the security work in Phase 0 is blocking because it concerns a leaked credential.

---

## 1. Objective and governing principles

### 1.1 What we are building

A single loan origination and servicing platform, developed once, deployed independently for each client. The system must support onboarding a new client without writing client-specific application code.

Two clients exist today. The design target is ten or more, and the cost of adding client N must be roughly constant, not linear in engineering time.

### 1.2 The governing distinction

**Shared codebase, isolated runtime.**

- **Shared**: one git repository, one `main` branch, one migration chain, one API implementation, one admin UI, one shared client logic package.
- **Isolated**: every client gets their own Supabase project, their own database, their own storage bucket, their own auth user pool, their own API deployment, and their own frontend deployments.

We are explicitly **not** building a multi-tenant runtime. There is no `tenant_id` column, no shared database with row-level tenant partitioning, and no single API instance serving multiple clients' data. Two lending businesses holding each other's applicant identity documents, bank statements and loan books in one Postgres instance is an unacceptable risk for a saving of roughly USD 25 per month per client.

### 1.3 The four rules

Every implementation decision must satisfy these. If a proposed change violates one, the change is wrong.

1. **No client-specific code.** Client differences live in configuration and data. If you find yourself writing `if (tenant === 'clientA')` anywhere outside the tenant config package, stop.
2. **No forking and no per-client branches.** One `main`. A client-specific branch is a permanent doubling of maintenance cost.
3. **The browser never talks to Supabase for data.** All data access goes through the API. See Section 3.4 for the single narrow exception (auth session management).
4. **Business logic lives in the core, never in a client UI.** A client UI may differ in screens, flow and presentation. It may not contain a business rule, a validation constant, or a data access call.

### 1.4 Non-goals

- Multi-tenancy within a single database.
- A shared API runtime serving multiple clients. Each client deployment is single-tenant at runtime.
- Retaining the dual data provider abstraction (`VITE_DATA_PROVIDER`). It is being removed, not generalised.
- Rewriting business logic that currently works. Migrating it and parameterising it is in scope. Redesigning it is not.

---

## 2. Target repository structure

```
apps/
  api/                      NestJS 10, deployed as Vercel Functions. The only thing that touches Postgres.
  admin-ui/                 Single shared staff portal. Themed per client, never forked.
  client-web-prdf/          Client 1 borrower-facing app (thin skin)
  client-web-<client2>/     Client 2 borrower-facing app (thin skin, structurally different screens)

packages/
  domain/                   Framework-free TypeScript. Types, enums, zod schemas, status transition graph,
                            amortisation and repayment allocation maths. Imported by api, admin-ui and client-core.
  api-client/               Typed HTTP client generated from the API's OpenAPI spec. The only way a frontend
                            reaches the API.
  client-core/              Headless React. Query hooks, mutation hooks, wizard state machine, form validation,
                            session handling. Contains zero JSX that renders visible layout.
  admin-core/               Same idea for the admin surface. Hooks and logic only.
  ui-kit/                   Design primitives and theme token contract. Unstyled or minimally styled components
                            that consume CSS variables.
  tenant-config/            Per-client configuration: branding, theme tokens, feature flags, copy, enabled
                            wizard steps. Validated by a zod schema at build time.

infra/
  supabase/
    migrations/             THE canonical, ordered, idempotent migration chain. This is the product.
    seed/                   Role catalogue and reference data seeds.
    tests/                  pgTAP or equivalent RLS assertion suite.
  scripts/
    provision-tenant.ts     Automates new client setup end to end.

docs/
  architecture.md           Regenerated from this document in Phase 0. Everything else deleted.
```

Turborepo and pnpm workspaces are already in use elsewhere in your stack and are the correct choice here. Configure Turbo task pipelines so that `build` for any app depends on `build` of its workspace dependencies, and so that a change to `packages/domain` invalidates the cache for every consumer.

---

## 3. The reusable core

### 3.1 Postgres is the business rule engine

The existing schema, its triggers and its RLS policies are the most valuable asset in this system and they stay in Postgres. Roughly 21 tables and 51 policies already encode the loan lifecycle correctly. Do not move this logic into the API layer.

The migration chain becomes the product. Every client runs a byte-identical schema. There is no per-client schema drift, ever. If client 2 needs something structurally new, it is added to the shared chain behind a feature flag or a configuration row, and every client receives the migration.

**Replace the current hand-maintained approach.** Today there are 16 sequential hand-written "phase" patch files with no CLI migration history. Move to Supabase CLI migrations (`supabase migration new`) so that migration state is tracked per project and `supabase db push` is reproducible. Squash the existing base schema plus the 16 patches into a single clean baseline migration, then continue forward with CLI-managed migrations only.

While squashing, fix the known defect: the Non-Financial Support RLS patch references `current_user_has_role`, which does not exist anywhere in the chain. Every other policy uses `is_in_role`. Applying the current chain to a fresh database fails at creation time, which means new client provisioning is currently broken. This must be fixed before Phase 5.

### 3.2 De-hardcoding: what becomes configuration

This is the single highest-leverage work in the project. Until it is complete, the system cannot serve two clients without forking.

| Currently hardcoded | Where it lives now | Where it moves to |
|---|---|---|
| Interest rate 18.5% (Prime 10.5 + 8) | Duplicated constant in `client-ui`, `admin-ui`, `backend-node` | `loan_products.interest_rate`, read at approval time |
| Loan amount range R250k to R5m | Client validation plus a DB CHECK constraint | `loan_products.min_amount` / `max_amount`, CHECK rewritten to validate against the product row |
| Loan term 1 to 60 months | Same as above | `loan_products.min_term_months` / `max_term_months` |
| The 10 mandatory document types | A DB trigger with a hardcoded list, while `document_requirements` sits unused | The trigger reads `document_requirements` for the application's product |
| Eligibility checklist criteria | Hardcoded JSX in `client-ui` | `tenant-config`, rendered from data |
| Branding, logo, copy, colours | Hardcoded across both UIs | `tenant-config` theme tokens and copy dictionary |
| Impact and demographic fields (BEE, HDP, rural, CSD) | Always-on form fields | Feature-flagged in `tenant-config`. A non-South-African client will not want these. |

Note the `document_requirements` table already exists and is disconnected from the trigger that actually enforces the rule. Wiring these together is a precondition for client 2, who will want a different document set.

**Accept that the CHECK constraint change is subtle.** The current constraint is exempted while status is `Draft` so that wizard autosave of partial data does not fail. Preserve that exemption when rewriting it to reference the product row.

### 3.3 The API layer

One NestJS application, deployed to Vercel Functions, single-tenant per deployment. It is the only component with database credentials.

**Responsibilities:**

- Authenticate every request by validating the Supabase-issued JWT.
- Enforce authorization in application code, re-deriving roles from the database rather than trusting JWT claims. The existing NestJS implementation already does this; keep the behaviour, drop the remote `supabase.auth.getUser()` call.
- Own all writes and all reads. No exceptions.
- Issue signed upload and download URLs for Storage. The browser must never hold a service role key or address Storage directly.
- Run the scheduled sweep.
- Expose an OpenAPI spec from which `packages/api-client` is generated.

**JWT validation must be local, not remote.** The current NestJS backend calls `supabase.auth.getUser(token)` on every single request, which is a network round trip to Supabase Auth for every API call. The .NET implementation validated locally against the JWKS/OIDC discovery endpoint, which is correct. Port that approach: fetch and cache the JWKS, verify the signature cryptographically in process. On serverless this matters more, not less, because a cold function paying an extra network round trip on top of its cold start is a visibly slow first request.

**Defense in depth: keep RLS live behind the API.** This is important and easy to get wrong. If the API connects to Postgres as the service role, RLS is silently bypassed and you have thrown away the entire authorization layer you already built. Instead, for every request, open a transaction and set the request's JWT claims on the connection so that `auth.uid()` and the `is_in_role` policies continue to apply:

```sql
-- executed at the start of every request transaction
select set_config('request.jwt.claims', $1::text, true);
set local role authenticated;
```

The result is two independent authorization layers: NestJS guards in application code, and RLS in the database. A bug in either one alone does not produce a data breach. This is the entire security argument for having an API layer at all, and it is the thing that Option B would otherwise fail to deliver.

**Connection pooling on serverless.** Functions are ephemeral and can create connection storms. Connect through Supabase's transaction-mode pooler (Supavisor, port 6543), not a direct connection. Because transaction mode does not support session-level state, the `set_config` call above must use the transaction-local form (third argument `true`) and must occur inside the same transaction as the query. Verify this explicitly in an integration test.

**Scheduled work.** `@nestjs/schedule` runs in process and will not survive on serverless functions. Replace it with a Vercel Cron Job invoking an authenticated internal endpoint:

- Endpoint: `POST /internal/cron/notification-sweep`
- Protection: a `CRON_SECRET` bearer token, rejected with 401 otherwise. This endpoint must not be reachable by any user JWT.
- Behaviour: unchanged from the existing sweep. The three conditions are arrears (a schedule installment past due and not fully paid), tasks due today or tomorrow, and applications sitting in `Submitted`, `UnderReview` or `InfoRequested` for more than 7 days since creation. Deduplicated to once per entity per calendar day.
- Alternative considered: `pg_cron` plus a Postgres function. Rejected because outbound HTTP will be needed as soon as real email is added, and keeping the sweep in application code keeps that path open.

**Before porting the sweep, verify it currently runs at all.** The existing CI/CD `deploy` job is a placeholder that only echoes intended targets, and neither backend is referenced in deployment automation. It is not established that the sweep has ever executed in production. If it has not, then arrears notifications have never fired for client 1, and that is a conversation to have with them rather than a bug to quietly fix.

### 3.4 The data access rule

**Frontends communicate with Supabase only through the API.** PostgREST is not called from the browser. `supabase.from(...)` does not appear in any frontend file. The Storage SDK is not called from the browser.

There is exactly one narrow exception, and it is a deliberate architectural decision rather than a leak:

**Auth session management stays client-side.** `@supabase/supabase-js` remains in the frontends for `signInWithPassword`, `signUp`, `signOut`, `getSession`, `onAuthStateChange` and token refresh only. Supabase Auth issues the JWT; the browser holds the session; every subsequent data call sends that JWT as a bearer token to the API, which validates it. Proxying auth through the API as well was considered and rejected: it would mean reimplementing token refresh, email confirmation and password reset flows for no security gain, since the JWT is user-scoped and useless without an endpoint that honours it.

To make this rule enforceable rather than aspirational, add an ESLint rule banning imports of `@supabase/supabase-js` outside a single `packages/client-core/src/auth` module, and add a CI grep that fails the build on `\.from\(` or `storage\.` in any `apps/*-ui` or `apps/client-web-*` directory.

### 3.5 What this fixes that is currently broken

Routing all data through the API repairs the reporting views that fail today. `docs/api-spec.md` documents turnaround time, pipeline conversion, productivity and audit log reports as generally available, but under the default Supabase provider they throw and fail silently into React Query's error state on the Reports page. They exist in backend code that nothing calls. Once the API is the only data path, these become reachable for the first time.

---

## 4. The frontends

### 4.1 Admin UI: one shared application, themed

The staff portal is functionally identical across clients. Loan officers review applications, verify documents, move statuses, log advisory support and read reports. There is no business reason for this to differ per client, and it must not be forked.

Client differences are limited to theme tokens (colours, logo, typeface), the product name and copy, and feature flags for optional modules such as Non-Financial Support and the impact reporting dashboards. All of these come from `packages/tenant-config`, selected by a `TENANT_ID` environment variable at build time.

Theming is implemented as CSS custom properties defined by the active tenant's token set, consumed by `ui-kit`. No per-client stylesheets, no per-client component overrides.

The six roles (SuperAdmin, Admin, LoanOfficer, Intern, Originator, Client) and the guard components (`RequireAuth`, `RequireRole`) are shared and unchanged. Delete the dead `ProtectedRoute` component from both apps; it is unused in both.

### 4.2 Client UI: a swappable skin over shared logic

This is the layer where clients are permitted to differ structurally. Client 2 wants materially different screens and a different flow, not a restyle, and that is acceptable **because the borrower-facing UI is the thinnest and most disposable part of the system.**

The architecture that makes this safe:

```
packages/client-core   (shared, mandatory)
  useApplication()             load, autosave and resume a draft
  useApplicationWizard()       step state machine, validation, submit gating
  useDocuments()               upload via API-issued signed URLs, status
  useEligibilityCheck()        criteria evaluation from tenant config
  useLoanStatus()              milestone tracker state
  useNotifications()           in-app inbox
  useAuth()                    the only module importing supabase-js

apps/client-web-<client>   (per client, thin)
  Screens, layout, routing, copy, animation, component composition.
  Imports hooks from client-core. Contains no data fetching, no
  business constants, no validation rules.
```

A client app is allowed to have a three-step wizard where another has five, provided the steps it renders are a subset or reordering of the steps `client-core` supports, driven by tenant config. It is not allowed to invent a new persisted field or a new validation rule locally. If client 2 needs a genuinely new field, that field goes into the shared schema, the shared API and `client-core`, behind a tenant config flag, and every client's deployment gets the migration.

**The maintenance boundary, stated plainly:** a second client UI is acceptable because it is thin. A second copy of the business logic never is. Enforce this in code review by rejecting any pull request that adds a network call, a numeric business constant, or a zod schema to an `apps/client-web-*` directory.

**Practical ceiling:** this pattern holds well to roughly three or four bespoke client UIs. Beyond that, the cost of restyling and re-testing N front ends starts to bite, and the right move is to invest in a configuration-driven UI that composes screens from a layout manifest. Do not build that now. Build it when the fourth bespoke UI is requested.

---

## 5. Deadweight to delete

All of the following are removed in Phase 1. This is not optional cleanup; each item is either duplicated maintenance surface or a live risk.

| Item | Reason |
|---|---|
| `backend/` (entire ASP.NET Core solution, 4 projects) | Parallel reimplementation of the same API. Already diverging: it is missing Non-Financial Support entirely. NestJS is the chosen runtime because ASP.NET Core does not run natively as a Vercel Function. Delete the directory and its CI steps. |
| Quartz scheduler configuration | Replaced by Vercel Cron. Goes with the .NET deletion. |
| `docker-compose.yml` | References only the .NET backend, which no longer exists. |
| `VITE_DATA_PROVIDER` and the dual-provider system | The entire reason the frontends can bypass the API. Delete the flag, the Supabase adapters and the adapter-selection logic. |
| `lib/data/repositories/*.repo.ts` Supabase adapters | Replaced by `packages/api-client`. Note the `applications` and `loans` repositories are currently hardcoded to the Supabase adapter regardless of the env flag; these are the two that must be repointed most carefully. |
| `ProtectedRoute` component (both UIs) | Dead code. `RequireAuth` and `RequireRole` are the live guards. |
| Committed `service_role` key in `client-ui/.env` and `admin-ui/.env` | See Phase 0. Rotate first, then delete. |
| `SENDGRID_API_KEY`, `TWILIO_*` placeholders | Unused. Reintroduce only when email or SMS is actually wired. |
| Azure Container Apps and Railway deployment configuration | No containers remain. |
| The `deploy` placeholder job in `ci-cd.yml` | Replaced by real deployment steps in Phase 6. |
| `docs/rbac.md`, `docs/system-specification.md`, `docs/api-spec.md` | Materially inaccurate on roles, permissions, status enums and API availability. Replace with a regenerated `docs/architecture.md` derived from this document plus the generated OpenAPI spec. |

---

## 6. Security requirements

These are not enhancements. Each one is a known open issue in the current system.

**Blocking, do first:**

1. **Rotate the Supabase `service_role` key** in the existing production project. It is committed to git history in two `.env` files and must be treated as compromised regardless of whether it is currently bundled into shipped code. Rotating is not enough on its own; the key remains in history, so rotation is what actually revokes it. After rotation, inject secrets only through Vercel and Supabase secret managers.
2. **Confirm IP ownership and client 1 contractual position** before any code is licensed or deployed for client 2. Out of scope for the implementation agent, flagged here because it blocks Phase 5.

**Required before client 2 goes live:**

3. **Set `file_size_limit` and `allowed_mime_types`** on the storage bucket. File type checking is currently client-side only with no server-side MIME validation. Add server-side validation in the API as well, since the client-side check is now bypassable by anyone calling the API directly.
4. **Close the `admin-ui` `/register` route.** It currently lets anyone on the internet self-register against the staff portal. The signup trigger only grants `Client`, so such accounts fail every admin route guard, but it is unnecessary surface and free consumption of the Auth quota. Replace with an invite-based flow, or remove it and have Admins create staff accounts.
5. **Enable TOTP MFA for all internal roles.** Supabase supports this natively at no cost. Staff can currently approve loans up to R5,000,000 behind a single password.
6. **RLS efficiency and correctness pass.** Rewrite the 51 policies' `is_in_role(...)` calls in the `(select is_in_role(...))` form so the planner caches the result per statement instead of re-evaluating per row. While in there, add the pgTAP assertion suite in `infra/supabase/tests/` covering, at minimum: a client cannot read another client's application, an unassigned Intern cannot read or mutate an application, a LoanOfficer can read all applications, and only a SuperAdmin can grant Admin.
7. **Add error tracking (Sentry) and real alerting.** Serilog currently writes to a console that vanishes on restart, and `uptime-check.yml` pings a health endpoint every 30 minutes with no alerting beyond the Action run itself failing. Do not sign any support SLA before this exists; you will otherwise learn about outages from an angry client.

**Preserve deliberately:**

8. The role model must continue to re-derive roles from `user_roles` and `roles` at query time. Roles must never be trusted from JWT claims, in either the API or the database.
9. Document immutability after insert must be preserved. Only verification metadata (`status`, `verification_note`, `verified_by`, `verified_at`) may be updated.
10. The database-level submission gate that blocks `Submitted` when required documents are missing must remain a trigger, not move into the API. It fires regardless of actor, which is the point.

---

## 7. Implementation phases

Each phase has a hard acceptance gate. Do not proceed past a failing gate.

### Phase 0: Secure and establish ground truth

- Rotate the `service_role` key; move all secrets to platform secret managers.
- Squash the base schema and 16 phase patches into one clean baseline migration under Supabase CLI management.
- Fix the undefined `current_user_has_role` reference.
- Verify the baseline applies cleanly to an empty Supabase project.
- Delete the inaccurate `docs/` files and regenerate `docs/architecture.md` from this specification.

**Gate:** `supabase db reset` against a fresh project succeeds with zero errors, and a smoke test can register a user, create a draft and read it back.

### Phase 1: Remove deadweight

- Execute every deletion in Section 5 except the `VITE_DATA_PROVIDER` removal, which depends on Phase 3.
- Rewrite `ci-cd.yml` to build and test the NestJS API and both frontends.

**Gate:** CI passes green on `main`. No reference to `backend/`, Quartz, Railway or Azure Container Apps remains anywhere in the repository.

### Phase 2: De-hardcode into configuration

- Implement the `loan_products` and `document_requirements` wiring per Section 3.2.
- Rewrite the amount and term CHECK constraints to validate against the product row, preserving the `Draft` exemption.
- Rewrite the document-requirement trigger to read `document_requirements`.
- Create `packages/tenant-config` with a zod-validated schema and a config for client 1 that exactly reproduces current behaviour.

**Gate:** client 1's deployment behaves identically to today, with zero business constants remaining in application code. Prove it: grep for `18.5`, `250000`, `5000000` and `60` across `apps/` and `packages/` and find nothing.

### Phase 3: Make the API the only data path

- Complete the NestJS API: local JWT validation, transaction-scoped RLS claim propagation, Supavisor pooling, signed URL issuance for Storage, and full endpoint coverage for every operation the frontends currently perform directly against Supabase.
- Generate `packages/api-client` from the OpenAPI spec.
- Repoint both frontends to `api-client`, including the two hardcoded repositories.
- Delete `VITE_DATA_PROVIDER` and all Supabase data adapters.
- Add the ESLint rule and CI grep from Section 3.4.
- Port the notification sweep to a Vercel Cron endpoint.

**Gate:** with the Supabase anon key removed from the frontend build entirely except for the auth module, both applications function end to end: register, complete the wizard, upload all 10 documents, submit, review, approve, disburse, record a repayment, close. The CI grep for direct Supabase data access returns zero hits. The previously broken reports (turnaround time, pipeline conversion, productivity, audit log) render successfully.

### Phase 4: Extract the shared logic packages

- Create `packages/domain`, `packages/client-core`, `packages/admin-core` and `packages/ui-kit`.
- Refactor the existing `client-ui` into `apps/client-web-prdf`, consuming `client-core`. The screens do not change; only their data and logic sources do.
- Implement theming in `admin-ui` from tenant config tokens.

**Gate:** `apps/client-web-prdf` contains no network calls, no business constants and no validation schemas. Client 1 remains functionally unchanged throughout.

### Phase 5: Provision client 2

- Write `infra/scripts/provision-tenant.ts` implementing the runbook in Section 8.
- Create client 2's Supabase project, tenant config and Vercel projects.
- Build `apps/client-web-<client2>` as a new thin skin over `client-core`.

**Gate:** client 2 is live, and the diff against `main` for the entire onboarding contains no changes to `packages/domain`, `apps/api` or `apps/admin-ui` beyond additive, flag-guarded work.

### Phase 6: Operational readiness

- Sentry across the API and both frontends.
- Real deployment automation replacing the placeholder job.
- Backup restore drill against a non-production project, documented.
- Quarterly access review and annual RLS audit added to a maintenance calendar.

**Gate:** a deliberately triggered API error appears in Sentry with an alert delivered, and a restore drill completes successfully.

---

## 8. New client onboarding runbook

Once Phase 5 is complete, adding a client is this checklist and should take under a day.

1. Create a new Supabase project in the appropriate region. Never reuse or share an existing client's project.
2. Apply the canonical migration chain and seeds.
3. Set the storage bucket's `file_size_limit` and `allowed_mime_types`.
4. Insert the client's `loan_products` row (rate, amount range, term range) and `document_requirements` rows.
5. Add `packages/tenant-config/tenants/<slug>.ts` with branding, theme tokens, copy and feature flags. Build fails if the zod schema does not validate.
6. Create the API Vercel project. Set `TENANT_ID`, database URL, Supabase URL, JWKS URL, service role key and `CRON_SECRET` as secrets. Configure the cron schedule.
7. Create the admin UI Vercel project with `TENANT_ID` and the API base URL.
8. Either point the client at an existing client web app with their tenant config, or scaffold a new thin skin if bespoke screens are required.
9. Create the first SuperAdmin account manually and verify MFA enrolment.
10. Run the end-to-end smoke test from the Phase 3 gate against the new deployment.
11. Sign the POPIA operator agreement, or the equivalent for the client's jurisdiction, before any real applicant data is entered.

---

## 9. Cost model per client

| Item | USD per month |
|---|---|
| Supabase Pro (dedicated project, includes USD 10 compute credit covering Micro) | 25 |
| Domain | 1 to 2 |
| Sentry, Resend, function invocations at pilot volume | 0 |
| **Per client subtotal** | **~26 to 27** |
| Point-in-time recovery add-on (recommended for a live loan book) | ~100 |

Vercel Pro is billed at USD 20 per developer seat, not per project, so it is a fixed platform cost across all clients rather than a per-client one. Keep non-deploying collaborators on free viewer seats. Note that Supabase charges roughly USD 10 per additional project within an organisation, so use a separate organisation per client for clean billing and clean handover, and use Supabase branching rather than standalone projects for staging.

---

## 10. Open decisions requiring a human answer

The implementation agent must not resolve these unilaterally. Each blocks the phase noted.

1. **IP ownership and client 1 exclusivity.** Blocks Phase 5. Requires legal review of prior employment contracts and client 1's agreement.
2. **Does document verification gate approval?** Today, only document *presence* is enforced; an application can reach `Approved` while its documents sit at `Uploaded` and were never verified. This may be intentional or may be a control gap. Decide, then either document it or add the gate. Blocks Phase 2.
3. **Is the current Intern and Originator permission scope intended?** `docs/rbac.md` claims document verification and post-submission status changes including Approve and Reject are LoanOfficer and Admin only. The code, at both the UI and RLS layers, allows any assigned Intern or Originator to do both. One of the two is wrong. Blocks Phase 6 sign-off.
4. **Does status transition validation move into the database?** The transition graph is currently enforced only by the admin UI filtering a dropdown. The database validates that the actor may update, not that the transition is legal. Anyone calling the API directly can currently make an illegal jump. Recommended: enforce it in the API and add a DB trigger. Blocks Phase 3.
5. **Is the hourly sweep running in production today?** Determines whether porting it is a migration or a first launch, and whether client 1 needs to be told that arrears alerts have never fired. Blocks Phase 3.
6. **Region and privacy regime per client.** Determines the Supabase region at project creation, which is not changeable afterwards without a migration. Blocks Phase 5 for each client.
7. **Risk-based pricing.** Marketing copy describes a rate from Prime up to Prime plus 8 percent depending on transaction quality, but no code path prices below Prime plus 8. Either build it or correct the copy. Not blocking, but it becomes a per-client configuration question the moment a second client asks for tiered rates.
