# PRDF LMS — Roles & Access

_Last updated: 2026-08-28_

This document describes every role the platform defines, what each role does, the
access it grants, and the end-to-end user journey for each. It also documents the
special handling of the **Client** role and provides a set of test users (one per
role) so each journey can be exercised.

Roles are the single source of truth in the database (`public.roles` /
`public.user_roles`) and are **always re-derived from the database per request** —
never trusted from a JWT. The canonical groupings live in
[`backend-node/src/auth/roles.helper.ts`](../backend-node/src/auth/roles.helper.ts);
the case-stage ownership lives in
[`backend-node/src/applications/applications.service.ts`](../backend-node/src/applications/applications.service.ts)
(`STAGE_OWNER`).

---

## 1. Two portals, one API

| Portal | App | Who gets in | Gate |
| --- | --- | --- | --- |
| **Admin / staff console** | `admin-ui` | Any **internal** user (Admin, SuperAdmin, or any workflow role) | `RequireRole` on `ALL_INTERNAL_ROLES` in `admin-ui/src/App.tsx` |
| **Client portal** | `client-ui` | Any user with the **Client** role | `RequireRole` on `['Client']` in `client-ui/src/App.tsx` |

Both apps talk to the same NestJS API (`backend-node`); separation is enforced by
per-service role checks plus row ownership plus Postgres RLS. A **Client-only** user
is authenticated but blocked from the admin portal ("Access restricted"). A user who
holds an internal role **and** Client can enter both.

---

## 2. Access model (how visibility is decided)

Three visibility tiers, defined in `roles.helper.ts`:

- **Management / decision-makers — `STAFF_ROLES`** = `SuperAdmin`, `Admin`,
  `ProgramManager`, `Board`. Full case visibility, portfolio/reports, audit.
- **Operational stage workers — `ASSIGNED_ROLES`** = `IntakeClerk`,
  `ProgramOfficer`, `RiskAnalyst`, `ReviewCommittee`, `Legal`, `FinanceOfficer`.
  See only the cases **assigned to them**.
- **Money movement — `FINANCE_ROLES`** = `FinanceOfficer`, `Admin`, `SuperAdmin`.
  May record disbursements and repayments.
- **Applicant — `Client`**. Sees only their **own** applications, documents, and
  tasks (scoped by `clientOwnerUserId == self`).

`INTERNAL_ROLES` = `SuperAdmin` + `Admin` + all 8 workflow roles — this is the set
that may enter the admin portal. `SuperAdmin` **inherits `Admin`** at runtime
(`fetchUserRoles`).

### The review chain (workflow-role ownership)

Each forward step of a loan application is owned by one workflow role — the role
that may advance a case **out of** a given status. Admin/SuperAdmin can override any
transition; ProgramManager and Board may decline at any stage.

```
Submitted     → IntakeClerk       → Screening / InfoRequested / Rejected
Screening     → ProgramOfficer    → DueDiligence / InfoRequested / Rejected
DueDiligence  → RiskAnalyst       → Evaluation / InfoRequested / Rejected
Evaluation    → ReviewCommittee /
                ProgramManager     → Approved / Rejected
Approved      → Board             → BoardApproved / Rejected
BoardApproved → Legal             → Contracting / Rejected
Contracting   → FinanceOfficer    → Disbursed
Disbursed     → FinanceOfficer    → InRepayment
InRepayment   → FinanceOfficer    → Closed
```

---

## 3. Role catalogue

| Role | Layer | Admin portal? | What it does |
| --- | --- | --- | --- |
| **SuperAdmin** | Platform owner | ✅ (inherits Admin) | Out-of-band platform owner. Everything Admin can, plus: grant/revoke **Admin**, reset another user's MFA. Managed **outside** the app — cannot be granted or revoked in-app. |
| **Admin** | Management | ✅ | Full case visibility, portfolio & reports, audit. Manages user access (assign/remove non-elevated roles). Finance actions. Granting **Admin** requires SuperAdmin. |
| **ProgramManager** | Management + workflow | ✅ | Full case visibility + reports. Owns the **Evaluation** decision and may **decline at any stage**. |
| **Board** | Management + workflow | ✅ | Full case visibility + reports. Owns the **Approved → BoardApproved** decision and may **decline at any stage**. |
| **IntakeClerk** | Workflow (assigned) | ✅ | First-line intake. Screens **Submitted** applications into Screening (or requests info / rejects). Sees assigned cases only. |
| **ProgramOfficer** | Workflow (assigned) | ✅ | Advances **Screening → DueDiligence**. Sees assigned cases only. |
| **RiskAnalyst** | Workflow (assigned) | ✅ | Advances **DueDiligence → Evaluation**. Sees assigned cases only. |
| **ReviewCommittee** | Workflow (assigned) | ✅ | Co-owns the **Evaluation** decision (Approve / Reject). Sees assigned cases only. |
| **Legal** | Workflow (assigned) | ✅ | Advances **BoardApproved → Contracting** (contracting/legal review). Sees assigned cases only. |
| **FinanceOfficer** | Workflow + finance | ✅ | Owns **Contracting → Disbursed → InRepayment → Closed**. Records disbursements & repayments. |
| **Client** | Portal applicant | ❌ | Applicant. Portal-only. Creates/submits their own applications, uploads documents, tracks their own case. **Assigned automatically at signup; never grantable from the admin.** |

Legacy roles `LoanOfficer`, `Intern`, `Originator` still exist in the database and
in old RLS policies but are **deprecated** by the expanded workflow model — see
§7. No test users are seeded for them.

---

## 4. Per-role access & user journeys

### SuperAdmin
- **Access:** everything. Full case visibility, reports, audit; grant/revoke Admin;
  reset MFA for other users; all finance actions. Cannot be assigned or removed
  through the app (platform-owner capability, provisioned out of band).
- **Journey:** Sign in → admin dashboard → **User Access**: promote a staff member
  to Admin, or clear a locked-out user's MFA so they can re-enrol → oversee the full
  pipeline and portfolio reports. Cannot revoke their own Admin/MFA (guard-railed).

### Admin
- **Access:** full case visibility across the pipeline, portfolio & reports, audit
  log; user-access management for all **non-elevated** roles; finance actions.
  Granting/removing Admin itself requires SuperAdmin.
- **Journey:** Sign in → dashboard (all cases) → assign incoming applications to the
  right stage workers → open **User Access** to grant workflow roles to staff → run
  portfolio/arrears reports.

### ProgramManager
- **Access:** management-tier — full case visibility + reports. Owns the Evaluation
  decision; may decline any case at any stage.
- **Journey:** Sign in → review cases at **Evaluation** → approve into Board review
  or reject → monitor the whole portfolio; step in to decline a stalled/ineligible
  case at any stage.

### Board
- **Access:** management-tier — full case visibility + reports. Owns the
  Approved → BoardApproved decision; may decline at any stage.
- **Journey:** Sign in → review **Approved** cases awaiting board sign-off → record
  BoardApproved (or reject) → hand off to Legal.

### IntakeClerk
- **Access:** cases **assigned to them**; advances Submitted applications.
- **Journey:** Sign in → open assigned **Submitted** cases → verify completeness →
  advance to **Screening**, or request more info, or reject.

### ProgramOfficer
- **Access:** assigned cases; advances Screening.
- **Journey:** Sign in → open assigned **Screening** cases → complete initial
  programme assessment → advance to **DueDiligence** (or request info / reject).

### RiskAnalyst
- **Access:** assigned cases; advances DueDiligence.
- **Journey:** Sign in → open assigned **DueDiligence** cases → complete risk review
  → advance to **Evaluation** (or request info / reject).

### ReviewCommittee
- **Access:** assigned cases; co-owns the Evaluation decision.
- **Journey:** Sign in → open assigned **Evaluation** cases → deliberate → approve
  (into Board review) or reject.

### Legal
- **Access:** assigned cases; advances BoardApproved.
- **Journey:** Sign in → open assigned **BoardApproved** cases → complete
  legal/contracting review → advance to **Contracting**.

### FinanceOfficer
- **Access:** assigned cases + money movement (`FINANCE_ROLES`).
- **Journey:** Sign in → **Contracting** case → record disbursement (**Disbursed**)
  → move into **InRepayment** → record repayments → **Closed** on completion.

### Client
- **Access:** the client **portal only**. Sees, creates, and submits only their own
  applications; uploads documents to their own draft; tracks their own case status.
  Blocked from the admin portal.
- **Journey:** Register / sign in to the client portal → start an application (Draft)
  → upload required documents → **Submit** → track status as it moves through the
  review chain → respond if info is requested.

---

## 5. The Client role — special handling

The Client role **identifies portal users** in the database; it is not a role that
staff hand out. Its lifecycle:

- **Granted automatically** at signup by the `handle_new_user` DB trigger, and
  explicitly during assisted onboarding (`clients.service.ts`). Neither path goes
  through the admin role-assignment API.
- **Not grantable from the admin — by anyone, including SuperAdmin.** Enforced in
  three layers (defense in depth):
  1. **UI** — `Client` is absent from the "Assign Role" dropdown on the User Access
     page (`admin-ui/src/pages/UserAccessPage.tsx`).
  2. **Backend** — `AdminService.assignRole` rejects `Client` with a clear error.
  3. **Database** — `admin_access_assign_managed_role` raises if asked to grant
     `Client`, so even a direct RPC call is refused.
- **Removal is still allowed.** A mistakenly-held Client chip can be cleared from a
  user (the `×` on the chip, `admin_access_remove_managed_role`).
- **Client-only users cannot enter the admin portal** — the admin gate requires an
  internal role.

## 6. Dual role: Client + Admin

Nothing prevents a person from holding both `Client` and an internal role. Such a
user:

- **Can enter the admin portal** (they hold Admin / an internal role) — this is the
  intended behaviour for staff who are also borrowers.
- Is treated as **staff first** by the backend: shared endpoints check `isStaff` /
  internal **before** the Client branch, so a client+admin user sees staff-level
  data even while using the client portal UI. Their personal client-only actions
  (submit/delete their own draft) still work because those are ownership-scoped.

There is currently no "acting-as" switch that separates a person's client identity
from their staff identity — this is documented existing behaviour, not changed here.

## 7. Legacy roles & known divergences

- **Legacy roles** `LoanOfficer`, `Intern`, `Originator` remain seeded and are still
  referenced by ~50 older RLS policies. They predate the 8-role PRDF workflow model
  and should be treated as deprecated. Migrating those RLS policies is out of scope
  for this change.
- **Frontend quirk:** `client-ui/src/lib/rbac.ts` `toAppRoles` defaults an
  unrecognised role set to `['Client']`. In practice every user also carries a real
  Client role, so this is latent, but worth noting.
- **Workflow-role RBAC catch-up (fixed here):** the 8 workflow roles were not in the
  database RBAC allowlists, so they could not be granted through the admin UI, were
  not counted as "internal", and did not appear in `list_assignable_users`.
  Migration `20260828120000_workflow_roles_rbac_and_block_client_grant.sql` brings
  those functions in line with `roles.helper.ts`.

---

## 8. Test users

One account per role (plus one Client+Admin dual user). Created by an idempotent
seed script:

- **Script:** [`infra/supabase/seed/seed-test-users.sql`](../infra/supabase/seed/seed-test-users.sql)
- **Shared password:** `Prdf-Test-2026!`
- **Run:** `psql "<db connection string>" -f infra/supabase/seed/seed-test-users.sql`
  (or wire into `supabase db reset`). Re-running is safe — it converges to the same
  state. **Test data only; never run against production.**

| Email | Role(s) | Admin portal | Client portal |
| --- | --- | --- | --- |
| `superadmin@prdf.test` | SuperAdmin (→ Admin at runtime) | ✅ | ❌ |
| `admin@prdf.test` | Admin | ✅ | ❌ |
| `programmanager@prdf.test` | ProgramManager | ✅ | ❌ |
| `board@prdf.test` | Board | ✅ | ❌ |
| `intakeclerk@prdf.test` | IntakeClerk | ✅ | ❌ |
| `programofficer@prdf.test` | ProgramOfficer | ✅ | ❌ |
| `riskanalyst@prdf.test` | RiskAnalyst | ✅ | ❌ |
| `reviewcommittee@prdf.test` | ReviewCommittee | ✅ | ❌ |
| `legal@prdf.test` | Legal | ✅ | ❌ |
| `financeofficer@prdf.test` | FinanceOfficer | ✅ | ❌ |
| `client@prdf.test` | Client | ❌ | ✅ |
| `clientadmin@prdf.test` | Client + Admin | ✅ | ✅ |

> **Note on MFA:** if `REQUIRE_MFA_FOR_STAFF` / `VITE_REQUIRE_MFA` is enabled, every
> internal test account will be prompted to enrol a second factor on first sign-in.
> Leave MFA off in the test environment, or enrol each account once.
