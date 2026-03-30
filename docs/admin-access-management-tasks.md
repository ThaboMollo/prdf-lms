# Admin Access Management Task Breakdown

This task list implements the feature spec in [admin-access-management-spec.md](./admin-access-management-spec.md).

## 1. Delivery Goal

Ship an admin-only screen where existing `Admin` users can grant or revoke `Admin` access for other internal users, with backend enforcement and audit logging.

## 2. Sequencing

Recommended order:

1. Backend authorization and data contracts
2. Grant/revoke business logic and audit logging
3. Admin UI route and screen
4. Frontend mutations and UX guardrails
5. Tests, QA, and docs

## 3. Task Backlog

## Epic A: Backend foundation

Progress status:

- `A1` Implemented
- `A2` Implemented
- `A3` Implemented
- `A4` Implemented
- `A5` Implemented
- `A6` Implemented
- `A7` Implemented
- Backend compile verification: Blocked in current sandbox because `dotnet build` restore/compile did not return a completed result

### A1. Define API contracts for admin access management

Goal:

- Add explicit request/response contracts for listing user access state and mutating `Admin` role assignment

Tasks:

- Add application-layer DTOs for admin access list items
- Add DTOs for mutation responses
- Define query parameters for search/filter support
- Keep contracts aligned with existing backend patterns

Acceptance criteria:

- Contract names and shapes are stable enough for frontend integration
- List responses include roles, admin state, and action eligibility flags

### A2. Add backend authorization policy for admin access management

Goal:

- Ensure only `Admin` users can use the feature

Tasks:

- Add or reuse a dedicated admin-only authorization policy
- Apply policy to new admin access endpoints
- Confirm non-admin internal users are rejected server-side

Acceptance criteria:

- Admin users receive access
- Non-admin users receive authorization failure

### A3. Implement internal user access query

Goal:

- Expose a backend query that returns internal users and their current roles

Tasks:

- Build query joining `auth.users`, `profiles`, `user_roles`, and `roles`
- Aggregate multiple roles per user
- Exclude client-only users from the result
- Add support for `search`, `filter`, and optional `role`
- Compute flags such as `isAdmin`, `canGrantAdmin`, `canRevokeAdmin`, and disabled reasons

Acceptance criteria:

- Admin sees internal users with current roles
- Client-only users are excluded
- Search and filters behave correctly

### A4. Implement grant-admin service logic

Goal:

- Allow an admin to grant `Admin` access safely and idempotently

Tasks:

- Resolve target user by UUID
- Validate target exists
- Validate target is an eligible internal user
- Resolve the `Admin` role id
- Insert into `public.user_roles` with duplicate-safe behavior
- Return updated role snapshot

Acceptance criteria:

- Grant succeeds for eligible internal user
- Repeat grant does not duplicate rows or error unnecessarily

### A5. Implement revoke-admin service logic

Goal:

- Allow an admin to revoke `Admin` safely from another admin

Tasks:

- Validate target exists
- Block self-revocation
- Count current admin users
- Block removal of the last remaining admin
- Delete only the `Admin` role mapping
- Return updated role snapshot

Acceptance criteria:

- Revoke succeeds for another admin
- Self-revoke is blocked
- Last-admin revoke is blocked
- Non-admin roles remain intact

### A6. Add audit logging for grant/revoke

Goal:

- Record every successful privilege change

Tasks:

- Insert `AdminGranted` audit record on grant
- Insert `AdminRevoked` audit record on revoke
- Include actor, target user, prior roles, resulting roles, and source surface in metadata

Acceptance criteria:

- Successful grant writes audit row
- Successful revoke writes audit row

### A7. Expose API endpoints

Goal:

- Provide a clear backend surface for the admin UI

Tasks:

- Add `GET /api/admin/users/access`
- Add `POST /api/admin/users/{userId}/roles/admin`
- Add `DELETE /api/admin/users/{userId}/roles/admin`
- Wire endpoints to authorization policy and service layer
- Return predictable error responses for blocked rules

Acceptance criteria:

- Endpoints are reachable by admins only
- Business rule errors map to consistent HTTP responses

## Epic B: Frontend admin UI

Progress status:

- `B1` Implemented
- `B2` Implemented
- `B3` Implemented
- `B4` Implemented
- `B5` Implemented
- `B6` Implemented
- Frontend build verification: Implemented and verified with `npm run build`

### B1. Add route and navigation entry

Goal:

- Make the feature discoverable in the admin UI

Tasks:

- Add new admin-only nav item: `User Access`
- Add route for the new page
- Protect route with existing admin RBAC checks

Acceptance criteria:

- Admin users can see and open the page
- Non-admin users cannot access the route

### B2. Build admin access page shell

Goal:

- Create the page structure and loading/error states

Tasks:

- Add page component in the admin UI
- Add header, subtitle, and layout container
- Add loading, empty, and error states

Acceptance criteria:

- Page renders cleanly within current admin UI patterns
- States are handled explicitly

### B3. Add search and filter controls

Goal:

- Let admins find target users quickly

Tasks:

- Add name/email search input
- Add filter control for `All`, `Admins`, `Non-admins`
- Optionally add role filter if low-cost in current UI patterns
- Connect controls to query params/state

Acceptance criteria:

- Search/filter controls update the list correctly

### B4. Build users table/list

Goal:

- Show current access state clearly

Tasks:

- Render columns for name, email, roles, admin state, actions
- Show badges/chips for roles
- Show disabled state messaging where actions are unavailable

Acceptance criteria:

- Users can distinguish admins from non-admin internal users at a glance

### B5. Implement grant-admin UI flow

Goal:

- Support safe admin assignment from the page

Tasks:

- Add `Grant Admin` action button
- Add confirmation dialog with target user details
- Call backend grant endpoint
- Refresh list on success
- Show success/error feedback

Acceptance criteria:

- Admin can grant access with confirmation
- UI updates immediately after success

### B6. Implement revoke-admin UI flow

Goal:

- Support safe admin removal from the page

Tasks:

- Add `Revoke Admin` action button
- Add destructive confirmation dialog
- Call backend revoke endpoint
- Refresh list on success
- Show rule-based error messages clearly

Acceptance criteria:

- Admin can revoke another admin with confirmation
- Self and last-admin cases show disabled or blocked behavior

## Epic C: Validation and hardening

Progress status:

- `C1` Partially implemented
- `C2` Pending
- `C3` Pending

### C1. Backend automated tests

Goal:

- Cover the core authorization and business rules

Tasks:

- Add tests for list endpoint authorization
- Add tests for grant success and idempotency
- Add tests for revoke success
- Add tests for self-revoke block
- Add tests for last-admin block
- Add tests for client-only target rejection
- Add tests for audit logging side effects

Acceptance criteria:

- Core rules are covered by automated tests

### C2. Frontend automated tests

Goal:

- Cover page behavior and mutation flows

Tasks:

- Add route visibility tests
- Add rendering tests for admin/non-admin states
- Add tests for confirmation dialogs
- Add tests for successful grant/revoke flows
- Add tests for disabled action states

Acceptance criteria:

- Key UI paths are covered and stable

### C3. Manual QA checklist

Goal:

- Validate the end-to-end behavior in a realistic environment

Tasks:

- Test with at least two admin accounts and one non-admin internal account
- Verify grant takes effect in product behavior
- Verify revoke removes access correctly
- Verify self-revoke is blocked
- Verify last-admin revoke is blocked
- Verify audit rows are created

Acceptance criteria:

- QA checklist passes without manual SQL intervention

## Epic D: Documentation and rollout

Progress status:

- `D1` Implemented
- `D2` Implemented

Current implementation note:

- Backend endpoint/controller coverage exists
- Service-level database rule tests are still pending
- Frontend automated tests are still pending

### D1. Update API documentation

Goal:

- Keep the repo docs aligned with the new backend surface

Tasks:

- Add the three admin access endpoints to [api-spec.md](/Users/thabomollomponya/Dev/phahla/prdf-lms/docs/api-spec.md)
- Note authorization expectations and main response semantics

Acceptance criteria:

- API spec reflects the new feature

### D2. Update operational/runbook notes

Goal:

- Reduce reliance on direct SQL for role changes

Tasks:

- Add note to runbook that admin access is managed in-product after bootstrap
- Clarify that manual SQL remains a recovery-only path

Acceptance criteria:

- Ops docs reflect the new operating model

## 4. Suggested Implementation Tickets

Use these as initial tickets:

1. Backend: add admin access list/query contracts and admin-only endpoints
2. Backend: implement grant-admin/revoke-admin business rules and audit logging
3. Admin UI: add `User Access` route, navigation item, and page shell
4. Admin UI: implement users table with search/filter and role status rendering
5. Admin UI: implement grant/revoke dialogs and mutation flows
6. Testing: add backend and frontend coverage for admin access management
7. Docs: update API spec and runbook for the new workflow

## 5. Dependencies

- Existing `Admin` role row in `public.roles`
- Existing backend auth/authorization plumbing
- Existing admin UI route and navigation structure
- Existing audit log insert pattern

## 6. Risks

- If JWT role claims are stale after role changes, the affected user may need to refresh session before access changes are reflected
- Querying `auth.users` plus role aggregation may need careful handling depending on current DB access patterns
- If admin-only actions currently rely on direct Supabase adapters in the admin UI, some provider alignment may be needed before this feature is clean

## 7. Recommended First Sprint Cut

If this is split across a short sprint, the smallest usable bundle is:

1. A2, A3, A4, A5, A6, A7
2. B1, B2, B4, B5, B6
3. C1

That produces a working feature with acceptable safety. Search/filter refinements and broader doc updates can follow immediately after if time is tight.
