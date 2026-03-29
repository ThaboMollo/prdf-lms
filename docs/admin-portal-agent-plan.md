# PRDF LMS Implementation Plan

This plan supersedes the earlier admin-portal-only plan. It aligns implementation with the requirements baseline in [system-specification.md](./system-specification.md) and is intended to drive the next delivery cycles.

## 1. Planning Objective

Move the current repository from partial LMS capability coverage to a coherent MVP that supports:

- Client-facing onboarding, application submission, document handling, status tracking, and repayment visibility
- Internal review, approval, disbursement, repayment administration, reporting, and auditability
- Clear separation between client and internal staff experiences over one shared backend domain

## 2. Current State Snapshot

### 2.1 Already implemented or partially implemented

- Authentication and route protection exist in the client UI/admin UI and API.
- Core application endpoints exist for drafts, submission, status changes, notes, and history.
- Document upload and verification flows exist.
- Assisted client onboarding endpoints exist.
- Loan disbursement and repayment recording endpoints exist.
- Notification and reporting endpoints already exist.
- Audit logging and RBAC foundations already exist in the database and backend.

### 2.2 Major gaps against the new specification

- The UIs are still one mixed experience instead of clearly separated client and admin surfaces.
- Client profile management is not yet a first-class product area in the UI and API contracts.
- Internal approval workflow needs stronger decisioning structure, rationale capture, and role/policy clarity.
- Admin user and role management is not implemented as a dedicated module.
- Dashboard coverage is incomplete relative to the required management and operations metrics.
- Document requirements, compliance controls, and notification management need a more complete admin workflow.
- Reporting exports, audit exploration, and operational tooling are not yet fully productized.
- The product specification needs to drive backlog and delivery sequencing across UI, backend, and database changes.

## 3. Delivery Principles

1. Deliver vertical slices that are deployable and testable.
2. Keep database changes additive through incremental SQL patch files.
3. Route all sensitive internal mutations through backend APIs, not direct browser writes.
4. Enforce RBAC in both API policies and Supabase RLS.
5. Update docs, tests, and runbooks with each feature slice rather than at the end.

## 4. Target MVP Scope

### 4.1 Client MVP

- Registration and login
- Client profile capture and editing
- Draft and submitted loan applications
- Required document upload and status visibility
- Application progress tracking
- Notifications for major events
- Repayment schedule and repayment history visibility

### 4.2 Internal MVP

- Staff authentication and RBAC
- Application intake, review, notes, and status progression
- Approval, rejection, and more-information decisions with rationale
- Disbursement capture
- Repayment administration
- Dashboard metrics and basic reporting
- Audit trail for major actions

## 5. Workstreams

### Workstream A: Platform and access control

Scope:

- Normalize roles, policies, and route guards
- Separate client-facing and internal-facing navigation and layouts
- Align repository provider behavior so privileged workflows consistently use backend APIs

Primary outputs:

- Policy matrix
- Auth and authorization cleanup
- Provider alignment for admin-sensitive operations

### Workstream B: Client onboarding and profile management

Scope:

- First-class client profile model and screens
- Self-service and staff-assisted onboarding flow alignment
- Profile completeness tracking and client-level document association

Primary outputs:

- Client profile UI and API surface
- Assisted onboarding refinements
- Profile completeness indicators

### Workstream C: Application workflow and decisioning

Scope:

- Draft, submit, review, await-documents, assessed, approved, rejected, disbursed, repayment, and closed transitions
- Structured internal notes and assessment outcomes
- Approval decision capture with actor, date, and rationale

Primary outputs:

- Refined status model
- Assessment and approval contracts
- End-to-end workflow UI for staff

### Workstream D: Documents and compliance

Scope:

- Mandatory document requirements by application type or workflow stage
- Document review, verification, and missing-document handling
- Compliance-ready history and audit trace

Primary outputs:

- Document requirements management
- Missing-document workflow
- Compliance and verification views

### Workstream E: Loans, disbursements, and repayments

Scope:

- Formal disbursement capture and history
- Repayment schedules, transactions, balances, and arrears
- Client and staff loan detail views

Primary outputs:

- Loan servicing UI and API refinements
- Arrears and overdue indicators
- Repayment visibility for both sides of the platform

### Workstream F: Dashboards, reports, and notifications

Scope:

- Operational dashboard KPIs
- Reporting exports and audit exploration
- Status-change notifications and reminder workflows

Primary outputs:

- Client dashboard and internal dashboard separation
- Management reporting workspace
- Notification event matrix and delivery handling

## 6. Phased Implementation Plan

### Phase 1: Foundation realignment

Goal:

Create the structural base needed to implement the wider specification safely.

Tasks:

1. Convert the planning baseline from admin-only to product-wide scope.
2. Define a role and policy matrix for all major actions.
3. Separate the UI information architecture into client and internal/admin sections.
4. Align repository/provider behavior so internal privileged mutations go through backend APIs.
5. Add missing API policy guards and validation consistency where needed.

Acceptance criteria:

1. Route and permission ownership is documented and enforced.
2. Frontend navigation clearly distinguishes client and internal workflows.
3. No privileged mutation depends on direct browser-only writes.

### Phase 2: Client onboarding and profile slice

Goal:

Make client identity and onboarding a complete product area instead of an implicit side effect of authentication.

Tasks:

1. Introduce explicit client profile contracts, endpoints, and persistence adjustments.
2. Build client profile create/edit screens.
3. Add profile completeness tracking.
4. Refine assisted onboarding to work against the same client profile model.
5. Link documents and applications cleanly to a client profile.

Acceptance criteria:

1. A client can create and maintain a usable profile.
2. Staff-assisted onboarding produces the same data shape as self-service onboarding.
3. Profile completeness is visible to staff and clients where appropriate.

### Phase 3: Application workflow and decisioning slice

Goal:

Complete the application journey from draft to formal decision.

Tasks:

1. Review and finalize the application status model against the specification.
2. Add structured assessment and approval decision entities and endpoints if missing.
3. Capture rationale, timestamps, and responsible users for decisions.
4. Improve staff review screens for notes, findings, and requests for more information.
5. Ensure clients can track status changes clearly.

Acceptance criteria:

1. Applications move through all required stages with audit history.
2. Approval, rejection, and return-for-information actions are fully traceable.
3. Client and staff status views are consistent.

### Phase 4: Document compliance slice

Goal:

Make document handling rule-driven and operationally manageable.

Tasks:

1. Add document requirements management by workflow or product type.
2. Add missing-document flagging and request flows.
3. Expand verification and review tooling for staff.
4. Confirm storage, metadata, and audit behavior meet compliance requirements.

Acceptance criteria:

1. Staff can tell what is missing, uploaded, pending review, or verified.
2. Clients receive clear prompts when documents are outstanding.
3. Document events are auditable.

### Phase 5: Loan servicing slice

Goal:

Complete approved-loan administration and borrower repayment visibility.

Tasks:

1. Refine disbursement capture and history presentation.
2. Add repayment schedule generation or persistence completion where needed.
3. Improve repayment transaction visibility, balances, and overdue indicators.
4. Ensure client-facing loan views expose only their own repayment data.

Acceptance criteria:

1. Approved loans can be disbursed and serviced end to end.
2. Outstanding balance and arrears are visible to staff.
3. Borrowers can view repayment information relevant to them.

### Phase 6: Internal operations and admin controls

Goal:

Provide internal teams with the management and administration capabilities required by the specification.

Tasks:

1. Implement admin user directory and role assignment workflows.
2. Add document requirement and notification configuration management.
3. Expand internal dashboards for application pipeline, approvals, disbursements, and arrears.
4. Productize reports and audit exploration with filters and exports.

Acceptance criteria:

1. Admins can manage users and internal configuration safely.
2. Management users can access the required KPI and reporting surfaces.
3. Audit and reporting tools are usable without direct database access.

### Phase 7: Hardening and release readiness

Goal:

Make the MVP operationally safe to release.

Tasks:

1. Add integration, UI, and end-to-end tests for critical workflows.
2. Run RLS and authorization verification for client, staff, and admin roles.
3. Update runbooks, support docs, and API documentation.
4. Add rollout controls, observability, and incident response guidance.

Acceptance criteria:

1. Critical client and staff flows are test-covered.
2. Role escalation and cross-client data access paths are blocked.
3. Operations documentation is current.

## 7. Recommended Next Sprint

Start with Phase 1 and Phase 2 in this order:

1. Finalize the role and route matrix.
2. Split UI navigation and layouts into client and internal sections.
3. Align provider/repository behavior for privileged operations.
4. Define the client profile contracts and persistence changes.
5. Implement client profile UI and assisted onboarding alignment.

Reasoning:

- The current repository already has application, document, and loan primitives.
- The biggest risk is building more features on top of mixed UX boundaries and inconsistent authorization paths.
- Client profile and IA cleanup unlock the rest of the specification cleanly.

## 8. Backlog Seeds for Immediate Implementation

### Backend

- Add explicit client profile service, contracts, validators, and controller
- Add policy-based authorization for internal-only and admin-only actions
- Add approval decision and assessment contracts where current endpoints are too generic
- Add incremental SQL patches for profile completeness, indexes, and any new workflow entities

### Frontend

- Create separate client and internal navigation models
- Add client profile page and onboarding flow states
- Add clearer application status and decision UX
- Add internal review and approval workspace refinements

### Docs and operations

- Update `docs/api-spec.md` as endpoints are added or changed
- Update `docs/rbac.md` with the policy matrix
- Update `docs/runbook.md` with rollout and support expectations for each release slice

## 9. Definition of Done for MVP

1. Clients can register, manage profiles, apply, upload documents, track status, and view repayment information.
2. Internal staff can review, assess, decide, disburse, and track repayments using role-appropriate tools.
3. Admin and management users can access user management, configuration, dashboards, and reports.
4. Major actions are audited and protected by backend authorization and RLS.
5. MVP workflows are covered by tests and documented for deployment and support.

## 10. Feature Implementation Checklist

Use this checklist to track implementation against the specification. Each item should be implemented end-to-end (DB, API, UI, tests) before moving on.

### Client-facing features

- Registration and login
- Client profile create/edit
- Loan application draft and submission
- Document upload and status visibility
- Application status tracking
- Notifications for status changes and missing documents
- Repayment schedule and repayment history visibility

### Internal workflow features

- Application review and internal notes
- Assessment outcomes and decision rationale
- Approve, reject, or request more information
- Disbursement capture and history
- Repayment tracking and arrears indicators

### Admin and management features

- User directory and role assignment
- Document requirements management
- Notification template management
- Dashboards for pipeline, approvals, disbursements, arrears
- Reporting exports and audit exploration

### Compliance and audit

- Audit logging for all major actions
- Role-based access enforced at API and RLS
- Document verification and compliance trace
