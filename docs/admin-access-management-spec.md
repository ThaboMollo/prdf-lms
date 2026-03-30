# Admin Access Management Feature Spec

## 1. Objective

Add an internal admin-facing feature that allows existing `Admin` users to grant and revoke `Admin` access for other internal users from the admin UI, without requiring manual SQL changes in Supabase.

This feature must fit the current RBAC model:

- roles are stored in `public.roles`
- user-role assignments are stored in `public.user_roles`
- privileged actions should be routed through the backend API
- all admin access changes must be auditable

## 2. Problem Statement

Admin rights are currently granted manually in SQL. That is operationally slow, error-prone, and not visible in the product. The system specification already requires that `Admin` users can manage users and permissions, but no dedicated module exists yet.

The gap is not just UI. The platform also lacks:

- a safe workflow for searching eligible users
- a clear authorization boundary for role changes
- protection against accidental self-lockout or unsafe privilege changes
- an audit trail for admin access decisions

## 3. Scope

### In scope

- Admin UI screen for viewing internal users and their current roles
- Search/filter by name, email, and role
- Grant `Admin` role to an eligible user
- Revoke `Admin` role from a user
- Confirmation UX for grant/revoke actions
- Backend endpoints for listing users and managing role assignments
- Audit log entries for admin access changes
- Guardrails to prevent unsafe changes

### Out of scope for this slice

- Full generic role-management for all roles
- Bulk import or bulk role assignment
- Invitation/onboarding flow for brand-new internal users
- Approval workflows for role changes
- Super-admin hierarchy beyond current `Admin`
- SCIM/SSO/identity provider sync

## 4. Primary Users

### Actor

- Existing authenticated `Admin`

### Target users

- Internal staff users such as `Intern`, `Originator`, `LoanOfficer`, or another `Admin`

### Non-users

- `Client` users must not appear as eligible candidates for admin assignment unless the product later supports converting client accounts into internal accounts through an explicit workflow

## 5. User Stories

1. As an `Admin`, I want to see which internal users currently have `Admin` access so I can review platform ownership.
2. As an `Admin`, I want to search for an internal staff user and grant `Admin` access from the admin UI so I do not need to run SQL manually.
3. As an `Admin`, I want to revoke `Admin` access when responsibilities change.
4. As an `Admin`, I want each grant/revoke action to record who made the change and when, so the platform remains audit-ready.
5. As an `Admin`, I want guardrails around my own account and the last remaining admin so I do not accidentally break platform administration.

## 6. Functional Requirements

### 6.1 Navigation and access

- Add a new admin-only navigation item: `User Access` or `Admin Access`
- Route must be visible only to users with the `Admin` role
- Route must be protected both in frontend guards and backend authorization

### 6.2 Admin access list screen

The screen should show a paged or filterable list of internal users with:

- full name
- email
- current roles
- primary/internal status indicator
- admin access status
- last updated timestamp if available
- action controls based on permissions

The screen should support:

- search by full name or email
- filters for `All`, `Admins`, `Non-admin internal users`
- optional filter by role

### 6.3 Grant admin access

An `Admin` must be able to:

- find an eligible internal user
- click `Grant Admin`
- review a confirmation dialog
- confirm the action

The confirmation should clearly show:

- target user name
- target user email
- current roles
- resulting roles after grant

Expected behavior:

- if the user does not already have `Admin`, create the `user_roles` assignment
- if the user already has `Admin`, return success without duplication
- write an audit log entry
- refresh the UI state immediately

### 6.4 Revoke admin access

An `Admin` must be able to:

- revoke `Admin` from another admin user
- review a confirmation dialog before finalizing

Expected behavior:

- remove only the `Admin` role mapping from `public.user_roles`
- preserve all non-admin roles
- write an audit log entry
- refresh the UI state immediately

### 6.5 Guardrails

The feature must enforce:

- an admin cannot revoke their own `Admin` access from this screen
- the system cannot remove `Admin` from the last remaining admin account
- client-only users are not eligible for admin assignment
- all write operations require backend authorization and may not be done directly from the browser to Supabase

Recommended phase-1 simplification:

- only users with at least one existing internal role are eligible to receive `Admin`

## 7. UX Specification

## 7.1 Page layout

Suggested page structure:

1. Page header
   - title: `User Access`
   - subtitle explaining this page controls elevated internal permissions
2. Filters/search bar
3. Users table or list
4. Empty state
5. Confirmation dialog for grant/revoke
6. Toast or inline feedback for success/failure

## 7.2 Table columns

Recommended columns:

- Name
- Email
- Roles
- Admin Access
- Actions

## 7.3 Actions

- Non-admin eligible user: `Grant Admin`
- Admin user: `Revoke Admin`
- Current signed-in admin row: action disabled with explanation
- Last remaining admin row: revoke disabled with explanation

## 7.4 States

The page must handle:

- initial loading
- empty search results
- mutation in progress
- backend error
- optimistic or immediate refetch after mutation

## 8. Authorization Rules

### Read access

- Only `Admin` can access the admin access management screen and related API endpoints

### Write access

- Only `Admin` can grant `Admin`
- Only `Admin` can revoke `Admin`

### Additional protection

- API must validate current actor roles server-side using trusted JWT role claims and, where necessary, database-backed checks
- UI checks are convenience only and not a security boundary

## 9. Data and Backend Design

## 9.1 Existing data model

Current relevant tables:

- `auth.users`
- `public.profiles`
- `public.roles`
- `public.user_roles`
- `public.audit_log`

No schema redesign is required for the core grant/revoke behavior because the current RBAC structure already supports it.

## 9.2 Required backend contracts

Recommended new endpoints:

- `GET /api/admin/users/access`
- `POST /api/admin/users/{userId}/roles/admin`
- `DELETE /api/admin/users/{userId}/roles/admin`

Suggested response shape for list endpoint:

```json
[
  {
    "userId": "uuid",
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "roles": ["LoanOfficer", "Admin"],
    "isAdmin": true,
    "isInternal": true,
    "canGrantAdmin": false,
    "canRevokeAdmin": true,
    "revokeDisabledReason": null
  }
]
```

Suggested mutation response:

```json
{
  "userId": "uuid",
  "roles": ["LoanOfficer", "Admin"],
  "isAdmin": true
}
```

## 9.3 Backend service logic

### List users for access management

The list query should:

- join `auth.users`, `public.profiles`, `public.user_roles`, and `public.roles`
- aggregate roles per user
- exclude users with only `Client` role
- include `Admin` users
- optionally support search and filters

### Grant admin service

Steps:

1. Validate actor is `Admin`
2. Validate target user exists
3. Validate target is an internal user
4. Resolve `Admin` role id from `public.roles`
5. Insert `(user_id, role_id)` into `public.user_roles`
6. Handle duplicate assignment safely
7. Insert audit log record
8. Return updated role snapshot

### Revoke admin service

Steps:

1. Validate actor is `Admin`
2. Validate target user exists
3. Block self-revocation
4. Count current admins and block removal if target is the last admin
5. Delete only the target `Admin` role assignment
6. Insert audit log record
7. Return updated role snapshot

## 9.4 Audit logging

Each change must insert into `public.audit_log` with at least:

- `entity`: `UserAccess`
- `entity_id`: target `user_id`
- `action`: `AdminGranted` or `AdminRevoked`
- `actor_user_id`: current admin
- `metadata`:
  - target email
  - target full name if available
  - prior roles
  - resulting roles
  - reason or source surface: `admin-ui`

## 10. Frontend Design Notes

## 10.1 Admin UI additions

Likely additions:

- new page under `admin-ui/src/pages/`
- API adapter method under the admin data layer
- route entry in admin app navigation
- role-gated page access using existing RBAC helpers

## 10.2 Data flow

Recommended pattern:

- fetch users via backend API, not direct Supabase browser access
- use a table/list query keyed by filters
- after grant/revoke, invalidate and refetch the list

## 10.3 UX guardrails

- confirmation modal must be mandatory before mutation
- destructive styling for revoke
- disabled actions should explain why they are unavailable
- success toast should identify the target user and resulting state

## 11. API and Validation Rules

### `GET /api/admin/users/access`

Query params:

- `search`
- `filter=all|admins|non-admins`
- `role`

Validation:

- only allow supported filter values

### `POST /api/admin/users/{userId}/roles/admin`

Validation:

- `userId` must be a valid UUID
- target must exist
- target must be internal

Response:

- `200 OK` if already admin or newly granted

### `DELETE /api/admin/users/{userId}/roles/admin`

Validation:

- `userId` must be a valid UUID
- target must exist
- target must not be current actor
- target must not be the last remaining admin

Response:

- `200 OK` with updated roles
- `409 Conflict` for blocked business rules such as last-admin removal

## 12. Security Considerations

- Never trust frontend role state alone
- Use backend authorization attributes/policies for all three endpoints
- Log every privilege change
- Do not expose service-role operations in browser code
- Consider rate-limiting or additional monitoring for repeated admin access changes

## 13. Testing Strategy

### Backend tests

- admin can list eligible users
- non-admin cannot access endpoints
- admin can grant admin to internal user
- duplicate grant is idempotent
- admin can revoke admin from another admin
- self-revoke is blocked
- last-admin revoke is blocked
- client-only target is blocked
- audit log is written for successful grant/revoke

### Frontend tests

- admin route renders only for admin users
- list page displays users and roles correctly
- grant action opens confirmation and calls API
- revoke action opens confirmation and calls API
- disabled revoke state appears for self and last-admin cases
- success and error states are surfaced correctly

### Manual QA

1. Log in as an existing admin
2. Open `User Access`
3. Search for an internal non-admin user
4. Grant `Admin`
5. Confirm target can now access admin-only features after new token/session refresh if required
6. Revoke `Admin` from another admin
7. Verify self-revoke and last-admin protection
8. Verify audit rows exist

## 14. Delivery Plan

### Phase 1: Backend foundation

- add admin access query/service
- add grant/revoke endpoints
- add audit logging
- add tests for core business rules

### Phase 2: Admin UI screen

- add navigation item and route
- add user access page with search/filter/table
- connect grant/revoke actions to backend
- add confirmation dialogs and feedback

### Phase 3: Hardening

- add pagination if needed
- refine disabled-state explanations
- add QA checklist and runbook notes

## 15. Acceptance Criteria

1. Only authenticated `Admin` users can open the admin access management screen.
2. The screen lists internal users with their current role set and admin status.
3. An admin can grant `Admin` access to an eligible internal user from the UI.
4. An admin can revoke `Admin` access from another admin user from the UI.
5. The system blocks self-revocation.
6. The system blocks revocation of the last remaining admin.
7. Client-only accounts are not assignable through this UI.
8. All successful changes create audit log records.
9. Admin-sensitive mutations are routed through backend APIs, not browser-direct Supabase writes.

## 16. Open Questions

1. Should `LoanOfficer` be the minimum role required before someone can become `Admin`, or is any internal role sufficient?
2. Should newly granted admin access take effect immediately, or only after the target user signs out and signs back in?
3. Do we want to show all internal users, or only active/confirmed users from `auth.users`?
4. Do we need a free-text reason field for grant/revoke actions for compliance purposes?
5. Should this feature eventually expand into full user-and-role administration for all roles?

## 17. Recommended First Cut

The pragmatic MVP is:

- list internal users
- show current roles
- grant/revoke only the `Admin` role
- block self-revoke and last-admin revoke
- write audit logs

That is the smallest slice that solves the operational problem cleanly without forcing a full RBAC administration module into the same delivery.
