# PRDF LMS — System Overview (Technical & Functional Architecture)

**Purpose of this document**: a precise, ground-truth description of what this application is and what it does — verified directly against the source code (frontend routes/guards, RLS policies, database schema, and both backend implementations), not against the aspirational spec docs. Where the existing docs (`docs/system-specification.md`, `docs/rbac.md`, `docs/api-spec.md`) disagree with what the code actually does, that's called out explicitly in Part C — those gaps are as important to understanding this system as the features themselves.

**Verified against source**: 2026-07-23.

---

## Part A — What this app is

**PRDF LMS is a loan-application and loan-servicing system for a development finance institution (DFI) making SME loans in South Africa.** It has two faces:

- **`client-ui`** — a self-service portal where a business applies for a loan: registers, works through a 5-step application wizard, uploads supporting documents, and tracks the application's status through to disbursement and repayment.
- **`admin-ui`** — an internal portal for PRDF staff to review applications, verify documents, approve/reject/disburse loans, track repayments, log advisory support given to clients, manage staff access, and view portfolio/impact reporting.

The loan itself is a straightforward term-loan product (fixed amount range, fixed term range, fixed interest rate — see Part A.3). What makes this a *development finance* system rather than a generic lending app is the data it collects and reports on: every application captures BEE-style ownership/impact criteria (black-women-owned %, historically-disadvantaged-person status, rural/township location, SA-national ownership %) purely for impact reporting, and the eligibility gate ahead of the application asks about developmental-impact and ownership/control criteria typical of a DFI mandate.

### A.1 Who uses it — roles and what they can actually do

Six roles exist (`infra/supabase/seed.sql`): **SuperAdmin, Admin, LoanOfficer, Intern, Originator, Client**. Roles live in `user_roles`/`roles` tables — never in JWT claims — and are resolved per-request via a `get_my_roles()` RPC (see Part B.3).

| Role | Can do |
|---|---|
| **Client** | Register, run the (non-binding) eligibility self-check, fill and submit the application wizard, upload documents, view their own application/loan status, receive in-app notifications. Assigned automatically to every new signup. |
| **Intern / Originator** | Everything staff-facing on applications *assigned to them*: view, add notes/tasks, verify/reject documents, **and change application status (including Approve/Reject)** — see the divergence note below, this is broader than the internal RBAC doc claims. Cannot access `/portfolio`, `/reports`, or `/user-access`. |
| **LoanOfficer** | Same as Intern/Originator but not limited to assigned applications — full visibility across applications — plus access to `/portfolio` and `/reports`. |
| **Admin** | Everything LoanOfficer can do, plus `/user-access` (grant/revoke Client/Intern/Originator/LoanOfficer roles). |
| **SuperAdmin** | Everything Admin can do, plus the only role that can grant/revoke **Admin** or **SuperAdmin** itself. Granting SuperAdmin auto-grants Admin. Guardrails prevent removing your own elevated access or removing the last remaining Admin/SuperAdmin. |

**Divergence from `docs/rbac.md`**: the doc states document verification and post-submission status changes (Approve/Reject/etc.) are "LoanOfficer/Admin only." In the actual code — both the `admin-ui` UI gating and the database RLS policies — any Intern or Originator assigned to an application can do both. This is a real, current permission scope, not a bug in the doc's intent; the architecture doc should be read as describing the system as documented-but-not-built.

### A.2 The application lifecycle, end to end

1. **Register** (`client-ui` `/register`) — Supabase email/password signup. A DB trigger auto-assigns the `Client` role. No business profile exists yet.
2. **Eligibility self-check** (`/eligibility`) — a checklist covering Developmental Impact, Ownership & Control, and Registration & Compliance criteria. **This is purely informational and not persisted or enforced anywhere** — a user can skip straight to the application wizard regardless of the outcome shown.
3. **Application wizard** (`/apply`, 5 steps: Business Profile → Financials → Loan Details → Documents → Review):
   - Autosaves as a `Draft` application from the first meaningful input; resumable via a `?draft=<id>` link. The `clients` business-profile row is created lazily on this first autosave, not at registration.
   - **Documents step**: all **10** document types are mandatory (ID, Proof of Address, Business Registration, Tax Clearance, 3-month Bank Statement, Financials, Vendor Quotation, CSD Report, Purchase Order, Trade Reference). This became fully mandatory only in the last two commits before this document was written (previously 4 of the 10 were optional) — anyone referencing older screenshots or the earlier spec should assume this is now the current, stricter state.
   - **Review step**: a consent modal captures POPIA/Terms/Policy acknowledgement as an immutable record before submission is allowed.
4. **Submit**: sets `status = Submitted`. This transition is **hard-blocked at the database level** (not just the UI) if any of the 10 required documents is missing — a trigger raises an exception regardless of who or what performs the update.
5. **Internal review** (`admin-ui` application detail view): assign to a staff member, move through statuses, verify or reject individual documents, add notes/tasks, log advisory (non-financial) support sessions.
6. **Status transitions**: `Draft → Submitted → {UnderReview, InfoRequested, Approved, Rejected}`, `InfoRequested ⇄ {Submitted, UnderReview}`, `Approved → Disbursed → InRepayment → Closed` (a separate `Withdrawn` exit exists from `Draft`). This transition graph is enforced only in the `admin-ui` (it filters the status dropdown) — the database does not itself validate that a transition is legal, only that the actor's role/assignment permits an update at all.
7. **Approval creates the loan automatically**: when status becomes `Approved`, a `loans` row is created with `principal_amount = requested_amount` and a fixed interest rate (Part A.3) — there is no officer-editable rate input anywhere in the product.
8. **Disbursement**: records a disbursement event, flips the loan to `Disbursed`, and generates the repayment schedule (equal-principal, declining-balance simple interest) if one doesn't already exist.
9. **Repayment**: each payment is applied principal-first-then-interest-per-installment... actually, applied to the earliest unpaid installments in order, updating `outstanding_principal`; the loan auto-closes (`status = Closed`) when the balance reaches zero, otherwise sits in `InRepayment`.

The client sees a simplified 6-step milestone tracker (`Submitted → UnderReview → Approved → Disbursed → InRepayment → Closed`) that visually folds `InfoRequested` into `UnderReview`.

### A.3 Business rules actually enforced

| Rule | Value | Enforced where |
|---|---|---|
| Loan amount | R250,000 – R5,000,000 | Client-side validation **and** a real DB CHECK constraint (exempted while status is `Draft`, so autosave of partial data doesn't fail) |
| Loan term | 1 – 60 months | Same as above |
| Interest rate | **Fixed at 18.5% p.a.** (Prime 10.5% + 8% margin) | Hardcoded constant, duplicated identically across `client-ui`, `admin-ui`, and (intended to match) `backend-node` |
| Required documents | All 10 types, before submission is possible | DB trigger, fires regardless of actor |
| File types accepted | `.pdf`, `.doc`, `.docx` | Client-side only — no server-side MIME validation observed |

**Worth flagging**: the product's marketing copy describes the rate as "Prime-linked, from Prime up to Prime + 8%, depending on the quality of the transaction" — but no code path exists that prices anywhere below Prime+8%. Every approved loan gets the same rate. If risk-based pricing is intended, it isn't built yet; if it isn't intended, the copy should be corrected.

Document **verification status** (`Verified`/`Rejected`/`Uploaded`) is tracked and visible, but currently **does not gate** any status transition — an application can be `Approved` while its documents still sit at `Uploaded` (never actually verified). Only document *presence* is a hard gate, not verification outcome.

### A.4 Demographic / impact data — what it's for

Fields like `is_hdp`, `is_black_women_owned`, `sa_citizenship_percentage`, `is_rural`, `province`, `gender`, `spatial_type` are captured in Step 1 of the application and stored on the `clients` record. They feed **aggregate reporting only** (demographic breakdown, province/spatial breakdown charts on the Admin Reports dashboard) — they are not used anywhere in eligibility scoring, pricing, or approval decisions. This is consistent with a DFI's impact-reporting mandate rather than a credit-risk model.

### A.5 Notifications & tasks

An hourly sweep scans for three conditions and writes in-app notifications (bell icon, both UIs):
- **Arrears**: a repayment-schedule installment is past its due date and not fully paid.
- **Task due soon**: an open task assigned to someone, due today or tomorrow.
- **Stale application**: an application sitting in `Submitted`/`UnderReview`/`InfoRequested` for more than 7 days *since creation* (not since its last status change).

Each condition is deduplicated so it only fires once per entity per calendar day. **Notifications are in-app only** — no email or SMS delivery exists despite `.env.example` having placeholder `SENDGRID_API_KEY`/`TWILIO_*` variables.

**Tasks** are lightweight work items scoped to a single application (title, assignee, due date, status) — there's no standalone task list page in either UI; they only exist inside an application's detail view.

### A.6 Non-financial support (NFS)

A log of advisory/mentorship hours PRDF staff give a client — separate from the loan itself, reflecting the DFI's broader support mandate. Recorded per client (optionally tied to a specific application) with a support type, duration, date, and notes. This is admin-ui-only; there's no client-facing view of it, and it isn't currently rolled into the Reports dashboard.

### A.7 Reporting

Available on `/portfolio` and `/reports` (LoanOfficer/Admin only): pipeline summary by status, origination trends over time, demographic breakdown, province/spatial breakdown, and debtor arrears-aging. Several other documented report types (turnaround time, pipeline conversion, productivity, audit log view) exist in the backend code but are **not functional in the app's default runtime configuration** — see Part C.

---

## Part B — Technical architecture

### B.1 System shape

This is a monorepo containing **more infrastructure than the app actually runs on day to day**:

```
client-ui/       React 19 + Vite SPA — client-facing
admin-ui/        React 19 + Vite SPA — internal/staff-facing
backend/         ASP.NET Core 9, Clean Architecture (4 projects) — "primary" per docs, built in CI
backend-node/    NestJS 10 — a parallel, functionally-equivalent reimplementation — absent from CI/deployment
infra/supabase/  Hand-maintained SQL: base schema + 16 sequential "phase" patch files (no CLI migration history)
```

Both `client-ui` and `admin-ui` support two data-provider modes, toggled by `VITE_DATA_PROVIDER`:
- `supabase` — the browser talks **directly** to Supabase (Postgres via PostgREST, plus Storage), authorization enforced entirely by RLS on the user's own JWT.
- `api` — the browser talks to one of the custom backends, which then talks to Postgres.

**The default, and what's actually configured in the checked-in `.env` files for both apps, is `supabase`.** This is the single most important fact for understanding the live system: **both backends are largely bypassed in normal operation.** The custom backends' only functions not otherwise reachable via direct Supabase access are the hourly notification sweep and a couple of service-role-privileged operations (e.g. presigned upload flows in one code path). Two data-access repositories (`applications`, `loans`) are additionally **hardcoded to the Supabase adapter regardless of the env flag**, so even flipping the provider setting doesn't route that traffic through a backend.

### B.2 Database (Supabase Postgres, ~21 tables)

| Domain | Tables | Purpose |
|---|---|---|
| Identity/RBAC | `profiles`, `roles`, `user_roles` | Auth-user extension; 6-role catalog; many-to-many role assignment |
| Clients | `clients` | Borrower/business profile, incl. BEE/impact fields |
| Applications | `loan_applications`, `application_consents`, `application_status_history` | Core workflow entity (with a `draft_state jsonb` blob for resumable wizard state); immutable consent record; status audit trail |
| Documents | `loan_documents`, `document_requirements` | Uploaded file metadata (files themselves live in Storage); per-product required-doc config (currently disconnected from the actual hardcoded 10-document enforcement trigger) |
| Loan servicing | `loan_products`, `loans`, `disbursements`, `repayments`, `repayment_schedule` | Product catalog; the booked loan (1:1 with an application); disbursement events; payments received; amortization schedule |
| Workflow | `tasks`, `notes`, `non_financial_support` | Per-application work items, free-text notes, advisory-hours log |
| Notifications | `notification_templates`, `user_preferences`, `notifications` | In-app notification delivery |
| Cross-cutting | `audit_log` | Polymorphic audit trail (entity/action/actor/metadata) |

Relationship spine: `auth.users → profiles/user_roles/clients → loan_applications → (consents, documents, status_history, tasks, notes, NFS) → loans (1:1) → (disbursements, repayments, repayment_schedule)`.

### B.3 Security model

Roles are never trusted from JWT claims — always re-derived from `user_roles`/`roles` at query time via a `SECURITY DEFINER` helper:

```sql
create function public.is_in_role(p_user_id uuid, p_role_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.name = p_role_name
  );
$$;
```

RLS is applied on essentially every table (~51 policies), following a consistent pattern — e.g. `loan_applications` select access is: the owning client, OR Admin/LoanOfficer (full visibility), OR an assigned Intern/Originator. Tables without a direct ownership column (like `loan_documents`) join back through `loan_applications → clients` to apply the same rule. A `get_my_roles()` RPC exposes the caller's roles to the frontend so the UI's role-based guards agree with what RLS will actually allow.

New signups are auto-granted `Client` via an `AFTER INSERT ON auth.users` trigger. Role changes (grant/revoke) go through `SECURITY DEFINER` RPC functions callable directly from `admin-ui`, each of which writes its own `audit_log` row — this is the one category of write that's reliably audited regardless of which data provider is active, because it never goes through frontend-direct table writes.

**Storage**: a single bucket (`loan-documents`), objects keyed as `applications/{applicationId}/{uuid}-{filename}`, gated by RLS on `storage.objects` using the same ownership/assignment logic. Uploaded documents are immutable after insert (a trigger blocks changing the file reference or type) — only verification metadata (`status`, `verification_note`, `verified_by/at`) can be updated afterward.

### B.4 Backends (both implementations)

| | `backend/` (.NET) | `backend-node/` (NestJS) |
|---|---|---|
| Structure | 4-project Clean Architecture (Domain/Application/Infrastructure/Api) | Feature modules (controllers+services per area), no layer separation |
| DB access | Dapper + Npgsql, raw parameterized SQL | Raw parameterized SQL via a shared `DatabaseService` |
| JWT validation | Local, cryptographic — validates against Supabase's JWKS/OIDC discovery endpoint | Remote — calls `supabase.auth.getUser(token)` on every request, a network round-trip to Supabase's Auth API |
| Authorization | Re-derives roles from the DB (not JWT claims) independently in application code, in addition to whatever RLS would apply | Same — re-derives roles from the DB per request |
| Feature parity | Missing **Non-Financial Support** entirely (no controller/service/table reference) | Has NFS; also has two report endpoints (`pipeline-summary`, `origination-trends`) not present in .NET and not in the API spec doc |
| In CI/CD | Yes — built and tested on every push | **No** — absent from `.github/workflows/ci-cd.yml` entirely |
| In `docker-compose.yml` | Yes | No |

Both implement the same hourly reminder sweep independently (Quartz in .NET, `@nestjs/schedule` in Node) — same three conditions described in A.5.

**Open question flagged by this research, not resolved by it**: since neither backend is referenced in the deployment automation (the CI/CD `deploy` job is a literal placeholder that only echoes intended targets) and the frontends default to bypassing both backends for data access, **it is not established that either backend — and therefore the hourly notification sweep — is actually running anywhere in production.** This should be confirmed operationally, not assumed.

### B.5 Frontend architecture

- **Routing**: `react-router-dom` v6, nested routes with guard components (`RequireAuth`, `RequireRole`) wrapping an `<Outlet/>`. An older `ProtectedRoute` component exists in both apps but is unused/dead — the active guards are `RequireAuth`/`RequireRole`.
- **Data layer**: a repository pattern (`lib/data/repositories/*.repo.ts`) resolves to either a Supabase adapter or an API adapter per B.1; pages/hooks only see the repository interface.
- **Server state**: React Query throughout, ad-hoc human-readable query keys (no centralized key factory), manual multi-key invalidation after mutations.
- **Auth state**: no context provider — held as local component state in each app's root, populated from `supabase.auth.getSession()` and kept live via `onAuthStateChange`.

### B.6 CI/CD and deployment

- `ci-cd.yml`: on push to `main`/`phase-*` or PR into `main` — builds/tests the .NET solution and builds both Vite frontends. `backend-node` is not touched.
- The `deploy` job is a **placeholder** — its only step echoes the intended targets (Vercel/Netlify for the frontends, Azure Container Apps for the API) with no actual deploy commands, secrets, or CLI calls wired up.
- `uptime-check.yml` pings a configured `/health` URL every 30 minutes with no alerting on failure beyond the Action run itself failing.

### B.7 Third-party services in use

Supabase (Postgres, Auth, Storage) and Vercel Analytics (client-ui only) are the only live external services. Email/SMS (SendGrid/Twilio), credit bureau checks, CSD API integration, OCR/e-signature, AI, payment gateways, and error tracking (Sentry) are all either absent or unused placeholder configuration.

---

## Part C — Where the documentation and the system disagree

These are current, verified gaps between what the existing docs claim and what the code does. They matter because anyone using this system's own docs to understand it will draw a materially wrong picture in several places.

1. **`docs/rbac.md` omits the `SuperAdmin` role** entirely. It's fully implemented and controls who can grant Admin access.
2. **`docs/rbac.md` claims document verification and post-submit status changes are LoanOfficer/Admin-only.** In the deployed system, any Intern/Originator assigned to the application can do both — enforced the same way at the UI and RLS layers, so this isn't a UI oversight.
3. **`docs/system-specification.md`'s role list and status enum don't match the implemented model** — the spec's `Approver/Reviewer` and `Management/Reporting User` roles were folded into `LoanOfficer`/`Admin`, and its "suggested" status names (`Awaiting Documents`, `Assessed`, `Active Repayment`) don't match the real enum (`InfoRequested`, no separate assessed state, `InRepayment`).
4. **The system is not "one shared backend API"** as `docs/system-specification.md` recommends — it's two parallel, largely bypassed backend implementations, with the frontends talking directly to Supabase by default. This breaks several reporting views (turnaround time, pipeline conversion, productivity, audit log) that `docs/api-spec.md` documents as generally available — they throw under the default provider and fail silently into React Query's error state on the Reports page.
5. **Interest-rate marketing copy** ("up to Prime+8%, depending on transaction quality") doesn't match the code, which always prices at exactly Prime+8%.
6. **It is not confirmed that either backend runs in production**, which means the hourly notification sweep's actual operation in production is unconfirmed, not just theoretically fragile.
7. **A committed Supabase `service_role` key** sits unused in both `client-ui/.env` and `admin-ui/.env` — not currently bundled into shipped code (verified: no references in either app's `src/`), but it's exactly the kind of dead config that gets bundled by accident later.
8. **`admin-ui`'s own `/register` page** lets anyone self-register, but the signup trigger only ever grants the `Client` role — which fails every admin-ui route guard. It functions only as step one of a manual staff-onboarding flow (create the account, then an Admin grants an internal role via User Access) — worth confirming this is the intended design rather than a leftover.
9. **A referenced-but-undefined function** (`current_user_has_role`, used in the Non-Financial Support RLS patch) doesn't exist anywhere in the migration chain under that name — every other policy uses `is_in_role`. Applying that patch to a fresh database would fail at creation time.
10. **Document requirements are recent and stricter than older references suggest** — all 10 document types are now mandatory as of the last two commits before this document; anything referencing "6 mandatory, 4 optional" reflects the prior state.
