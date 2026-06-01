# Admin UI Design Implementation Plan

This plan translates the internal/admin screens in `untitled.pen` into implementation work for `admin-ui`.

Design source:

- `Admin - Dashboard`
- `Admin - Applications`
- `Admin - Portfolio Dashboard`
- `Admin - User Access`
- Shared admin components: top bar, sidebar, nav item, KPI card, status badge

## 1. Objective

Implement the new admin experience as an operational loan-management workspace covering:

- Staff dashboard and intake KPIs
- Application queue and review detail pane
- Portfolio monitoring
- User access management
- Consistent navigation, search, status badges, tables, and action states

The implementation should preserve the design direction while fitting the existing React, Vite, Supabase, TanStack Query, repository, and RBAC structure.

## 2. Current Codebase Fit

Primary files and areas:

- `admin-ui/src/App.tsx`
- `admin-ui/src/app/AppShell.tsx`
- `admin-ui/src/app/layout/AppShell.tsx`
- `admin-ui/src/app/layout/Sidebar.tsx`
- `admin-ui/src/app/layout/Topbar.tsx`
- `admin-ui/src/pages/DashboardPage.tsx`
- `admin-ui/src/pages/ApplicationsPage.tsx`
- `admin-ui/src/pages/PortfolioPage.tsx`
- `admin-ui/src/pages/UserAccessPage.tsx`
- `admin-ui/src/pages/LoanDetailsPage.tsx`
- `admin-ui/src/components/shared/*`
- `admin-ui/src/styles/global.css`

Existing reusable components already align with several design needs:

- `KPIStatCard`
- `StatusBadge`
- `PaginationControls`
- `PageHeader`
- `Skeletons`
- `EmptyState`
- `ToastProvider`

## 3. Design System Targets

Use the admin visual language from the Pencil variables:

- Background: neutral white and light gray surfaces
- Brand: restrained blue for navigation and primary actions
- Typography: practical, compact, operational sans-serif
- Tables: dense but readable
- Cards: low-radius, functional KPI and detail containers only
- Badges: status-color coded with visible text labels

Implementation notes:

- Admin screens should be quiet, scannable, and work-focused.
- Avoid oversized marketing typography in operational screens.
- Keep tables and detail views aligned to consistent column and spacing rules.
- Fix the clipped KPI card issue found in the Pencil review for `Portfolio Dashboard` and `User Access`.

## 4. Route and Role Map

Current target route map:

- `/login`
- `/register`
- `/dashboard`
- `/applications`
- `/loans`
- `/portfolio`
- `/user-access`

Role expectations:

- `Intern`, `Originator`, `LoanOfficer`, `Admin`: dashboard and applications
- `Originator`, `LoanOfficer`, `Admin`: loan details
- `LoanOfficer`, `Admin`: portfolio
- `Admin`: user access

Implementation tasks:

1. Keep route protection aligned with `RequireAuth` and `RequireRole`.
2. Ensure hidden navigation items match route authorization.
3. Add explicit restriction states for deep-linked unauthorized pages.

Acceptance criteria:

- Users only see nav items they can open.
- Deep links to unauthorized routes fail clearly.
- Role rules match backend/API enforcement.

## 5. Shared Shell and Components

### Phase 1: Admin Shell

Scope:

- Align admin `Topbar`, `Sidebar`, and app layout with the Pencil admin screens.

Tasks:

1. Implement the compact top bar with product mark, global search, notification icon, and account affordance.
2. Implement the white/neutral sidebar with active item highlight.
3. Keep layout width stable for `1440x900` desktop.
4. Add mobile/tablet behavior: sidebar drawer or collapsed navigation.
5. Confirm all pages inherit the same content gutter and header rhythm.

Acceptance criteria:

- Admin pages share one consistent shell.
- Active route state is visible.
- No layout overlap at desktop, tablet, or mobile widths.

### Phase 2: Shared Admin Primitives

Scope:

- Stabilize the visual language before page-specific work.

Tasks:

1. Update `KPIStatCard` to match admin card proportions and prevent clipping.
2. Update `StatusBadge` variants for application, document, repayment, user-role, and risk states.
3. Standardize buttons: primary, secondary, destructive, ghost, and icon-only.
4. Standardize filters, search inputs, select controls, and pagination.
5. Add table row selected, hover, loading, empty, and error states.

Acceptance criteria:

- KPI cards do not clip at `PortfolioPage` or `UserAccessPage`.
- Badges remain legible and do not rely on color alone.
- Tables and filters look consistent across admin screens.

## 6. Screen Implementation Plan

### Phase 3: Dashboard

Scope:

- Implement the `Admin - Dashboard` design: KPI row, recent applications table, and operational search.

Tasks:

1. Update `DashboardPage` with the designed KPI set.
2. Show changes/trends with concise positive/negative indicators.
3. Add recent application table with applicant, amount, status, date, and assignee.
4. Wire row click to application detail or `/applications` selection state.
5. Add loading, empty, error, and permission states.

Acceptance criteria:

- Dashboard answers: "What needs attention today?"
- Recent applications are actionable.
- KPI data handles unavailable or loading state cleanly.

### Phase 4: Applications Queue and Review Detail

Scope:

- Implement the `Admin - Applications` split queue/detail workspace.

Tasks:

1. Preserve the two-zone queue and detail layout on desktop.
2. Add filters for status, assignee, priority, and search.
3. Make selected application state visible in the queue.
4. Build detail pane sections: applicant, business, loan details, documents, notes, timeline.
5. Add primary actions: approve, request info, reject.
6. Gate actions by role and current application status.
7. Add confirmation and rationale capture for request-info, approve, and reject.

Acceptance criteria:

- Staff can triage applications without leaving the queue.
- Each decision captures rationale where required.
- Action buttons reflect eligibility and disabled reasons.
- Mobile/tablet converts the detail pane into a separate route or drawer-like stacked flow.

### Phase 5: Portfolio Dashboard

Scope:

- Implement the `Portfolio Dashboard` design: portfolio KPIs, loan table, arrears and outstanding balance visibility.

Tasks:

1. Fix KPI card sizing so all three cards render without clipping.
2. Update `PortfolioPage` with active loans, outstanding balance, and arrears/overdue KPIs.
3. Add sortable/filterable loan table.
4. Show risk/arrears indicators clearly.
5. Add pagination through `PaginationControls`.
6. Wire row click to `LoanDetailsPage` or a loan detail route.

Acceptance criteria:

- Loan officers can identify risky or overdue accounts quickly.
- Table scales beyond one page.
- KPI cards remain stable across responsive widths.

### Phase 6: User Access

Scope:

- Implement the `User Access` design with admin-only role management.

Tasks:

1. Fix KPI card sizing so top metrics do not clip.
2. Align `UserAccessPage` with the design: metrics, search, filters, user table.
3. Keep existing grant/revoke admin behavior and disabled reasons.
4. Add confirmation for privilege changes.
5. Show audit-friendly success messages after role changes.
6. Add loading, empty, error, and unauthorized states.

Acceptance criteria:

- Admin users can manage access without ambiguity.
- Self-revoke and last-admin constraints remain visible.
- Mutation outcomes are confirmed with updated row state.

### Phase 7: Loan Details

Scope:

- Bring `LoanDetailsPage` into visual alignment with the admin design system.

Tasks:

1. Use the same page header, KPI, table, and detail-section patterns.
2. Show loan summary, repayment schedule, repayments, disbursement details, and audit trail.
3. Add record repayment and disbursement actions where role-eligible.
4. Add confirmation and validation states for financial mutations.

Acceptance criteria:

- Loan details feel like part of the same admin product.
- Financial mutations provide clear validation and feedback.
- Unauthorized users can view only what their role permits.

## 7. Responsive Plan

Required breakpoints:

- Mobile: 360-480px
- Tablet: 768px
- Desktop: 1024px and 1440px

Rules:

- Sidebar becomes drawer or collapsed navigation on mobile/tablet.
- KPI rows wrap or stack without clipping.
- Application split view becomes list-first with detail as a separate view on mobile.
- Tables collapse into row cards only where column density would break readability.
- Filters stack above tables on mobile.

Acceptance criteria:

- No horizontal page overflow at target widths.
- Table controls remain reachable.
- Primary actions remain visible but not overcrowded.

## 8. Required States

Each admin screen must implement:

- Loading state
- Empty state
- Error state
- Unauthorized or restricted state
- Mutation pending state
- Success confirmation

Specific state coverage:

- Dashboard: no recent applications, metrics unavailable
- Applications: no queue results, selected application missing, action forbidden, decision failure
- Portfolio: no active loans, no arrears, report data unavailable
- User Access: no users match filter, grant/revoke blocked, mutation failed
- Loan Details: missing loan, repayment validation error, disbursement validation error

## 9. Accessibility and UX Requirements

Tasks:

1. Use semantic tables for tabular data where practical.
2. Ensure table rows and action buttons are keyboard accessible.
3. Add visible focus states.
4. Use text labels with all status badges.
5. Ensure destructive actions are visually distinct and require confirmation.
6. Ensure global search and filters have labels.

Acceptance criteria:

- Admin workflows can be navigated with keyboard.
- Screen reader labels identify filters, actions, and status.
- Destructive and privileged actions are never accidental.

## 10. Verification Checklist

Run before considering implementation complete:

1. `npm run build` in `admin-ui`
2. Manual smoke test for every route
3. Role-gated route checks for `Intern`, `Originator`, `LoanOfficer`, and `Admin`
4. Application queue selection and decision actions
5. Portfolio pagination and responsive table behavior
6. User access grant/revoke happy path and blocked rules
7. Responsive checks at 390px, 768px, 1024px, and 1440px
8. Empty/loading/error state review

## 11. Delivery Order

Recommended order:

1. Shared tokens and admin shell
2. Shared components: KPI, badges, buttons, filters, pagination, tables
3. Dashboard
4. Applications queue/detail
5. Portfolio
6. User Access
7. Loan Details alignment
8. Responsive pass
9. State/accessibility pass
10. Build and smoke verification
