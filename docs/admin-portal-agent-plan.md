# PRDF LMS Admin Portal Implementation Plan

## 1. Current State Review (Frontend + Backend)

### Frontend findings
- Current app routes include `/dashboard`, `/applications`, `/loans`, `/portfolio`, but no dedicated admin portal route (`prdf-lms/frontend/src/App.tsx:81`, `prdf-lms/frontend/src/App.tsx:82`, `prdf-lms/frontend/src/App.tsx:84`, `prdf-lms/frontend/src/App.tsx:87`).
- Sidebar/navigation has no admin section or admin-specific IA (`prdf-lms/frontend/src/app/layout/navigation.ts:10`).
- Data provider behavior is inconsistent for domain repositories:
  - `applications` is hard-wired to Supabase even when provider is `api` (`prdf-lms/frontend/src/lib/data/repositories/applications.repo.ts:26`, `prdf-lms/frontend/src/lib/data/repositories/applications.repo.ts:29`).
  - `reports` is currently Supabase-only (`prdf-lms/frontend/src/lib/data/repositories/reports.repo.ts:10`).
  - `tasks` already supports provider switching (`prdf-lms/frontend/src/lib/data/repositories/tasks.repo.ts:15`).

### Backend findings
- Existing API already exposes admin-adjacent capabilities: audit and operational reporting, document requirements, document verification, onboarding/invite, portfolio and arrears.
- There is no explicit admin controller or user/role management API surface yet (no `/api/admin/*` routes in current controllers).
- Authorization strategy is primarily `[Authorize]` + service-level role checks. This is workable, but admin portal operations should adopt explicit policy checks for clarity and defense-in-depth.

### Database/RLS findings
- RBAC entities exist: `profiles`, `roles`, `user_roles` (`prdf-lms/infra/supabase/schema.sql:5`, `prdf-lms/infra/supabase/schema.sql:12`, `prdf-lms/infra/supabase/schema.sql:17`).
- RLS currently allows self-read for profiles/roles and admin-read for audit log (`prdf-lms/infra/supabase/rls.sql:38`, `prdf-lms/infra/supabase/rls.sql:51`, `prdf-lms/infra/supabase/rls.sql:321`).
- Admin-friendly operational tables already exist: `notification_templates`, `user_preferences`, `audit_log`, `document_requirements`.

## 2. Target Admin Portal Scope

Build an `Admin`-only portal covering:
1. User directory and role assignment.
2. Internal staff onboarding/invite and deactivation.
3. System configuration for document requirements and notification templates.
4. Audit/compliance views and operational reporting.
5. Admin dashboard with KPIs and workload/health indicators.

Out of scope for first release:
1. Fine-grained permission editor per endpoint.
2. Multi-tenant organization management.
3. Full workflow engine redesign.

## 3. Delivery Strategy

Use a vertical-slice rollout so each slice is deployable:
1. Platform hardening + admin access control.
2. User/role management.
3. Config management (document requirements + templates).
4. Audit/reporting workspace.
5. UX polish, observability, and release hardening.

## 4. Step-by-Step Plan

### Step 1: Define admin portal contract and IA
1. Create an architecture decision record in `docs/`:
   - Admin route map.
   - Role/policy matrix for each admin action.
   - API contracts (request/response/error model).
2. Define frontend information architecture:
   - `/admin` landing dashboard.
   - `/admin/users`
   - `/admin/config`
   - `/admin/reports`
   - `/admin/audit`
3. Define non-functional targets:
   - P95 API response under 500 ms for list endpoints.
   - Pagination defaults and max limits.
   - Auditability requirements for every admin mutation.

Acceptance criteria:
1. Admin module scope and API contracts are documented and approved.
2. No ambiguity on which role can perform each action.

### Step 2: Add backend authorization policies for admin operations
1. In API startup, register named policies:
   - `AdminOnly`
   - `InternalStaff` (Admin + LoanOfficer for selected screens where needed)
2. Apply `[Authorize(Policy = "AdminOnly")]` to all admin mutation endpoints.
3. Keep service-level checks in place as secondary controls.

Acceptance criteria:
1. Any non-admin token gets `403` on admin mutation endpoints.
2. Integration tests cover allow/deny behavior by role.

### Step 3: Build backend admin module (`/api/admin/*`)
1. Create `AdminController` with versioned endpoints for:
   - `GET /api/admin/users` (paged, filter by role/status/search)
   - `GET /api/admin/users/{id}`
   - `POST /api/admin/users/{id}/roles` (set roles atomically)
   - `POST /api/admin/users/{id}/deactivate`
   - `POST /api/admin/users/{id}/reactivate`
2. Add supporting application contracts and validators.
3. Add infrastructure service that uses DB + Supabase Admin APIs where required.
4. Ensure every mutation writes to `audit_log` with actor + metadata payload.

Acceptance criteria:
1. Admin can list users and update role assignments safely.
2. All admin mutations are audited.
3. Validation and error responses are consistent with existing API style.

### Step 4: Extend database/RLS for admin management use cases
1. Add SQL patch (new incremental script) for:
   - Optional user status fields (`is_active`, timestamps) in `profiles` or dedicated table.
   - Indexes for user search/list performance.
2. Update RLS/policies for admin read/update on managed profile/role records.
3. Keep least privilege:
   - Client and non-admin internal users should not gain broad profile visibility.

Acceptance criteria:
1. RLS still blocks non-admin broad reads.
2. Admin list queries perform efficiently on realistic data sizes.

### Step 5: Unify frontend provider strategy before admin UI
1. Remove partial provider divergence:
   - Add API adapters and switching for repositories currently Supabase-only (`applications`, `reports`, and any new admin repository).
2. Ensure admin-sensitive operations use backend endpoints, not direct browser writes.
3. Add feature flag for admin portal enablement:
   - `VITE_ENABLE_ADMIN_PORTAL=true|false`

Acceptance criteria:
1. Admin features behave consistently in selected provider mode.
2. No admin mutation depends on insecure client-only Supabase logic.

### Step 6: Add frontend admin routes and guards
1. Add `Admin` route group to `App.tsx` and navigation:
   - Wrap with `RequireRole allowed={['Admin']}`.
2. Add dedicated admin layout shell (section tabs + breadcrumb + filter bar).
3. Ensure non-admin users never see admin navigation items.

Acceptance criteria:
1. Admin users see portal links and pages.
2. Non-admin users are redirected/forbidden for all admin routes.

### Step 7: Implement Admin Users page
1. Build `AdminUsersPage`:
   - User table with server-driven pagination, search, and role filters.
   - User detail drawer/panel.
   - Role assignment editor with optimistic UI + rollback on failure.
2. Add bulk-safe UX:
   - Confirmation dialog for deactivation/reactivation.
   - Dirty-state warnings.
3. Add proper loading/empty/error states using existing shared components.

Acceptance criteria:
1. Admin can find users quickly and modify roles with clear feedback.
2. UI handles API failures without stale local state.

### Step 8: Implement Admin Config page
1. Build configuration sections:
   - Document requirements management.
   - Notification template management.
2. Use server validation for template fields and requirement uniqueness.
3. Add change history links to audit records where possible.

Acceptance criteria:
1. Config changes are persisted and visible immediately.
2. Invalid configuration is blocked with actionable errors.

### Step 9: Implement Admin Reports + Audit pages
1. Reports page:
   - Reuse existing reporting endpoints (turnaround, conversion, productivity, portfolio, arrears).
   - Add date ranges and CSV export for each table.
2. Audit page:
   - Query by date range, actor, entity, action.
   - Add pagination and metadata inspection panel.
3. Add API-side query limit controls and sane defaults.

Acceptance criteria:
1. Admin can self-serve compliance evidence and operational metrics.
2. Query performance and result limits are predictable.

### Step 10: Tests and quality gates
1. Backend tests:
   - Admin authorization integration tests.
   - Validator tests.
   - Audit logging tests for all admin mutations.
2. Frontend tests:
   - Route guard tests.
   - Admin user flows (list, assign role, deactivate/reactivate).
   - Config/report rendering and error-state tests.
3. End-to-end tests:
   - Admin happy path.
   - Non-admin blocked path.

Acceptance criteria:
1. CI passes with new admin test suite.
2. Critical admin workflows are covered end-to-end.

### Step 11: Security, observability, and rollout
1. Add structured logs for admin actions (actor, endpoint, outcome, latency).
2. Add rate limits for sensitive admin mutation endpoints.
3. Run pre-prod checklist:
   - RLS verification scripts.
   - Role-escalation abuse tests.
   - Token/claim edge case tests.
4. Release with feature flag and staged rollout:
   - Internal QA -> limited admins -> full admin cohort.

Acceptance criteria:
1. Admin portal is observable, auditable, and reversible.
2. Rollout can be paused/disabled via feature flag.

## 5. Suggested Implementation Order (2-Week Sprint Model)

1. Sprint 1:
   - Steps 1 to 4 (contracts, auth policies, admin backend, DB/RLS patch).
2. Sprint 2:
   - Steps 5 to 7 (provider alignment, routes/guards, user management UI).
3. Sprint 3:
   - Steps 8 to 11 (config, reports/audit, hardening, rollout).

## 6. AI Agent Execution Checklist

1. Do not bypass backend authorization for admin mutations.
2. Keep all DB changes additive and delivered as incremental SQL patch files.
3. Add tests with every feature slice; do not batch testing at the end.
4. Preserve existing role model (`Admin`, `LoanOfficer`, `Originator`, `Intern`, `Client`) unless explicitly approved to change.
5. Update `docs/api-spec.md`, `docs/rbac.md`, and `docs/runbook.md` with each admin feature addition.

## 7. Definition of Done

1. Admin portal routes exist and are Admin-only.
2. Admin can manage users and roles end-to-end.
3. Admin can manage document requirements and notification templates.
4. Admin can access reports and audit logs with filters and exports.
5. All admin mutations are audited and covered by tests.
6. Feature is deployed behind a toggle with a documented rollback path.
