# Admin-UI Implementation Specification

This spec covers both design implementation (visual/UX updates) and functional implementation (new features required by the LMS Functionality Requirements). It audits what currently exists in code vs what is required.

Design source: `untitled.pen` — Admin screens (Dashboard, Applications, Portfolio, User Access)
Design plan: `docs/admin-ui-design-implementation-plan.md`
Requirements source: `docs/LMS Functionality Requirements.md`

---

## 1. Current State Audit

### 1.1 Existing Routes

| Route | Page | Allowed Roles | Status |
|-------|------|---------------|--------|
| `/login` | LoginPage | Public | EXISTS — centered auth card |
| `/register` | RegisterPage | Public | EXISTS — registration form |
| `/dashboard` | DashboardPage | Intern, Originator, LoanOfficer, Admin | EXISTS — role-aware KPIs, queue, tasks, notifications |
| `/applications` | ApplicationsPage | Intern, Originator, LoanOfficer, Admin | EXISTS — master-detail with status filter, tabs (Details, Documents, History, Tasks, Notes) |
| `/loans` | LoanDetailsPage | Originator, LoanOfficer, Admin | EXISTS — loan summary, repayment schedule, disbursements |
| `/portfolio` | PortfolioPage | LoanOfficer, Admin | EXISTS — portfolio summary KPIs, arrears table with pagination |
| `/user-access` | UserAccessPage | Admin | EXISTS — user table with search, filters, grant/revoke admin, role assignment, confirmation modal |

### 1.2 Existing Components

| Component | File | Status |
|-----------|------|--------|
| KPIStatCard | `components/shared/KPIStatCard.tsx` | EXISTS |
| StatusBadge | `components/shared/StatusBadge.tsx` | EXISTS |
| PaginationControls | `components/shared/PaginationControls.tsx` | EXISTS |
| PageHeader | `components/shared/PageHeader.tsx` | EXISTS |
| Skeletons | `components/shared/Skeletons.tsx` | EXISTS |
| EmptyState | `components/shared/EmptyState.tsx` | EXISTS |
| ErrorBoundary | `components/shared/ErrorBoundary.tsx` | EXISTS |
| ToastProvider | `components/shared/ToastProvider.tsx` | EXISTS |

### 1.3 Existing Data Layer

| Domain | UseCase | Repository | Supabase Adapter | API Adapter |
|--------|---------|------------|------------------|-------------|
| Applications | EXISTS | EXISTS | EXISTS | EXISTS |
| Documents | EXISTS | EXISTS | EXISTS | EXISTS |
| Loans | EXISTS | EXISTS | EXISTS | — |
| Notes | EXISTS | EXISTS | EXISTS | EXISTS |
| Notifications | EXISTS | EXISTS | EXISTS | EXISTS |
| Reports | EXISTS | EXISTS | EXISTS | — |
| Tasks | EXISTS | EXISTS | EXISTS | EXISTS |

### 1.4 Existing Auth and Guards

- `RequireAuth` — session check, redirects to `/login`
- `RequireRole` — nested role-based route guards:
  - All internal: `['Intern', 'Originator', 'LoanOfficer', 'Admin']`
  - Loan details: `['Originator', 'LoanOfficer', 'Admin']`
  - Portfolio: `['LoanOfficer', 'Admin']`
  - User access: `['Admin']`

### 1.5 Existing Application Processing Features

The ApplicationsPage currently supports:
- Master-detail split layout with status filter tabs
- Detail panel with tabs: Details, Documents, History, Tasks, Notes
- Status transitions: Submit, UnderReview, InfoRequested, Approved, Rejected, Disbursed, InRepayment, Closed
- Application assignment to a user
- Task creation on applications
- Notes creation on applications
- Document verification (Verified/Rejected status)

---

## 2. Gap Analysis: Requirements vs Code

### 2.1 IMPLEMENTED (exists in code, may need design updates only)

| Requirement | Code Location | Notes |
|-------------|---------------|-------|
| View and review submitted applications | ApplicationsPage | Master-detail with filters and tabs |
| Record assessment outcomes and notes | ApplicationsPage (Notes tab) | Notes CRUD exists |
| Approve, reject, or request more information | ApplicationsPage (status transitions) | Status state machine implemented |
| Capture disbursement details | LoanDetailsPage | Disbursement recording exists |
| Track repayments and arrears | PortfolioPage + LoanDetailsPage | Arrears table with pagination, repayment recording |
| Manage users and permissions | UserAccessPage | Grant/revoke admin, assign roles, with confirmation modals |
| Monitor performance metrics | DashboardPage | Role-aware KPI cards, queue table |
| Send notifications | notifications usecase | listNotifications + markRead |

### 2.2 NOT IMPLEMENTED (required by LMS Functionality Requirements)

| ID | Requirement | Priority | Details |
|----|-------------|----------|---------|
| A1 | **Turnaround Time Tracking (SLA)** | HIGH | Requirements say "maximum 5 working days turnaround time. Applications must close or move to red status." No SLA calculation, deadline tracking, or visual overdue indicators exist. No red/warning status on stale applications. |
| A2 | **SEDFA and NCR Reporting** | HIGH | Requirements list extensive reports: applications by province (EC, KZN, Gauteng), gender/demographic breakdowns (HDPs, disabled, rural), total credit transactions (daily/monthly/quarterly/annual), age analysis of debtors book, write-offs. Current reporting only has basic portfolio summary (`totalLoans`, `activeLoans`, `outstandingPrincipal`) and arrears list. No provincial, demographic, or period-based reporting exists. |
| A3 | **Collections Management** | HIGH | Requirements mention: debit order collection with first preference, overdue invoice sending, payment arrangements, credit limit adjustments, promise-to-pay recording. Only basic repayment recording exists. No collections workflow, debit order integration, payment arrangement tracking, or automated overdue notices. |
| A4 | **Receipting** | MEDIUM | Requirements mention receipting functionality. No receipt generation or recording system exists in the admin UI. |
| A5 | **Interest Rate Management** | MEDIUM | Requirements mention "updating of interest rates". No UI to view or update interest rates on loans. The `loans` table has `interest_rate` column but no admin interface to modify it. |
| A6 | **Refund Processing** | MEDIUM | Requirements mention refund functionality. No refund workflow or recording exists in the admin UI. |
| A7 | **Intern/Youth Onboarding** | HIGH | Requirements say "System must allow registration, training and quiz test for interns and youth (Q&A)". No training content, quiz system, or intern onboarding flow exists. |
| A8 | **Provincial Data Capture** | MEDIUM | Reporting requires provincial breakdowns. No province field exists on `clients` or `loan_applications`. Cannot generate provincial reports without this data. |
| A9 | **Demographic Data Capture** | MEDIUM | Reporting requires gender, HDP status, disability status, rural/urban classification. No demographic fields exist on `clients` table. Cannot generate demographic reports without this data. |
| A10 | **Notification Template Management** | LOW | `notification_templates` table exists in DB but no admin UI to create, edit, or manage templates. |
| A11 | **Audit Trail UI** | LOW | `audit_log` table exists in DB but no admin UI to search or view audit records. |
| A12 | **SEDFA Communication Interface** | MEDIUM | Requirements mention "Communication between the client, SEDFA and the Service Provider". No structured communication channel or interface exists. |
| A13 | **Document Requirement Configuration** | LOW | `document_requirements` table exists in DB but no admin UI to configure which documents are required per product or status. Document types are hardcoded in client-ui. |
| A14 | **Loan Product Management** | LOW | `loan_products` table exists in DB but no admin UI to create or manage loan products. |
| A15 | **Responsive / Mobile** | MEDIUM | Requirements say "Accessibility: web, desktop, tablet or mobile". Admin UI has no verified mobile layout. |

### 2.3 EXISTS IN DATABASE BUT NOT WIRED IN ADMIN UI

| DB Table | Status in Admin UI |
|----------|-------------------|
| `loan_products` | Not used. No product management UI. |
| `document_requirements` | Not used. No configuration UI. |
| `notification_templates` | Not used in admin. No template management UI. |
| `user_preferences` | Not used. No admin view of user notification preferences. |
| `audit_log` | Not used. No audit log viewer. |

---

## 3. Implementation Plan

### Phase 1: Design System and Shell Updates

**Goal**: Apply the new Centered Device Cascade visual design from `untitled.pen`.
**Ref**: `docs/admin-ui-design-implementation-plan.md` — Phases 1-2

Files to modify:
- `src/styles/global.css` — Update font imports (Inter, Geist, Funnel Sans), update CSS variables, add Soft Cloud shadow tokens, update component styles
- `src/app/AppShell.tsx` or `src/app/layout/AppShell.tsx` — Update shell layout
- `src/app/layout/Sidebar.tsx` — White/neutral sidebar with active item blue highlight, lucide icons
- `src/app/layout/Topbar.tsx` — 56px top bar with "PRDF LMS" logo, search bar (400px), notification bell, avatar

New CSS variables:
```
--font-heading: 'Inter', sans-serif  (weight 600)
--font-body: 'Geist', sans-serif
--font-caption: 'Funnel Sans', sans-serif
--bg: #ffffff
--surface: #fafafa
--text: #111111
--text-secondary: #444444
--text-muted: #888888
--border: #e5e5e5
--radius-sm: 4
--radius-xl: 12
--radius-full: 9999
--shadow-soft: 0 2px 4px rgba(0,0,0,0.03), 0 12px 32px rgba(0,0,0,0.06)
```

Acceptance criteria:
- All screens use the Centered Device Cascade design language
- Top bar and sidebar match Pencil designs with search bar and nav items
- KPI cards use Soft Cloud dual shadows without clipping
- Mobile sidebar collapses to drawer

### Phase 2: Page Visual Updates

**Goal**: Update each existing page to match the new Pencil designs.
**Ref**: `docs/admin-ui-design-implementation-plan.md` — Phases 3-7

| Page | Key Visual Changes |
|------|-------------------|
| DashboardPage | Inter 600 greeting, 4 KPI cards (using component with trend indicators), applications table with header row, status badges (pill shape, full radius), clean row separators |
| ApplicationsPage | Master-detail: left 380px list panel with search, filter chips (All/Pending/Approved/Rejected), application cards with left-border highlight on selection. Right detail panel: applicant header with meta dots, action buttons (Approve green, Request Info outlined, Reject red outlined), tabbed content with field grid, assignment section with avatar |
| PortfolioPage | 3 KPI cards, arrears table with 8 columns (Loan ID, Application ID, Installment, Due Date, Due, Paid, Outstanding, Days Overdue), pagination controls, Export CSV button |
| UserAccessPage | 3 KPI cards, filter row with search + dropdowns, user table with role pill badges, admin access status badges, action buttons |
| LoanDetailsPage | Same design system: page header, KPI-style loan summary, repayment schedule table, disbursement details |
| LoginPage | Centered card layout (simpler than client split-screen) |

### Phase 3: Turnaround Time / SLA Tracking (A1)

**Goal**: Track application processing time and flag overdue applications.

Implementation:
- Calculate working days since `submitted_at` for each application
- Define SLA threshold: 5 working days (from requirements)
- Add SLA status indicator to application list and detail views:
  - Green: within SLA (0-3 days)
  - Yellow: approaching SLA (4 days)
  - Red: overdue (5+ days)
- Add "Days in Queue" column to dashboard applications table
- Add SLA KPI to dashboard: "Overdue Applications" count
- Add filter for "Overdue" applications in ApplicationsPage

New files:
- `src/lib/sla.ts` — SLA calculation utilities (working days, holidays, status)

Data: Uses existing `submitted_at` and `application_status_history` timestamps. No DB changes needed.

Sidebar: Add SLA indicator dot next to "Applications" nav item when overdue apps exist.

### Phase 4: SEDFA and NCR Reporting (A2)

**Goal**: Build the reporting dashboard for regulatory compliance.

New files:
- `src/pages/ReportsPage.tsx` — Reporting dashboard with multiple report types
- `src/features/reports/types.ts` — Report type definitions
- `src/logic/usecases/reports/index.ts` — Update with new report queries

Route: `/reports` — accessible to LoanOfficer and Admin roles.

Reports to implement (from requirements):

**4a. Application Reports**
- Applications received, approved, rejected by province (EC, KZN, Gauteng)
- Daily / Monthly / Quarterly / Annual period filters
- Breakdown by loan product
- Reasons for decline (aggregate)

**4b. Credit Transaction Reports**
- Total Rand value of credit transactions
- Total number of credit transactions
- Total value of credit facilities (new and limit increase)
- Period filters: monthly, quarterly, annually

**4c. Demographic Reports**
- HDPs, disabled persons, rural areas, general small business
- Same metrics as credit transactions but segmented by demographic

**4d. Debtors Book Reports**
- Gross value of debtors book
- Less: Total provision for doubtful debt
- Equals: Net value of debtors book
- Number of accounts
- Write-offs (Rand value and count)
- Age analysis: Current, 30 days, 31-60 days, 61-90 days, 91-120 days

**REQUIRES**: 
- DB: Province field on `clients` or `loan_applications` (see A8)
- DB: Demographic fields on `clients` (see A9)
- DB: Write-off tracking (new table or status on loans)
- DB: Provision for doubtful debt calculation
- Backend: Report aggregation queries (complex SQL or views)

**OPEN QUESTION**: Should reports be pre-computed (materialized views) or calculated on demand? Volume will determine approach.

### Phase 5: Collections Management (A3)

**Goal**: Build collections workflow for overdue loans.

New files:
- `src/pages/CollectionsPage.tsx` — Collections dashboard and workflow
- `src/features/collections/types.ts` — Collection action types
- `src/logic/usecases/collections/index.ts` — Collections use cases
- `src/lib/data/repositories/collections.repo.ts` — Collections repository

Route: `/collections` — accessible to LoanOfficer and Admin.

Features to implement:
1. **Overdue accounts list** — Loans with missed payments, sorted by days overdue
2. **Payment arrangement recording** — Capture agreed payment plans for delinquent borrowers
3. **Promise-to-pay tracking** — Record client commitments with follow-up dates
4. **Overdue invoice generation** — Create and send overdue notices
5. **Collection actions log** — Record calls, emails, letters sent

**REQUIRES**:
- DB: New `collection_actions` table (type, loan_id, action_date, notes, follow_up_date)
- DB: New `payment_arrangements` table (loan_id, agreed_amount, frequency, start_date, status)
- Backend: Automated overdue detection and notification triggers

**NOT IN SCOPE (requires external integration)**:
- Debit order system integration (requires banking partner API)
- Credit limit adjustments (requires credit bureau integration)

**OPEN QUESTIONS**:
- Which debit order provider will PRDF use?
- Should overdue notices be auto-sent or manually triggered?

### Phase 6: Interest Rate and Refund Management (A5, A6)

**Goal**: Admin UI for updating interest rates and processing refunds.

**Interest Rate Updates:**
- Add "Update Interest Rate" action on LoanDetailsPage
- Show current rate, allow input of new rate with effective date
- Record change in audit_log
- Recalculate remaining repayment schedule based on new rate

**Refund Processing:**
- Add "Process Refund" action on LoanDetailsPage
- Capture: refund amount, reason, bank details, authorization
- Record in new `refunds` table
- Update loan outstanding balance

**REQUIRES**: DB: New `refunds` table (loan_id, amount, reason, processed_by, processed_at, reference)

### Phase 7: Intern/Youth Onboarding (A7)

**Goal**: Build training and assessment system for interns and youth originators.

New files:
- `src/pages/InternOnboardingPage.tsx` — Training modules and quiz
- `src/features/training/modules.ts` — Training content definitions
- `src/features/training/quiz.ts` — Quiz questions and scoring

Route: `/onboarding` — accessible to Intern role.

Features:
1. **Training modules** — Structured learning content about PRDF processes, loan lifecycle, document requirements
2. **Quiz/assessment** — Multiple choice questions with pass/fail scoring
3. **Progress tracking** — Track which modules completed, quiz scores
4. **Certification** — Mark intern as "onboarding complete" to unlock full system access

**REQUIRES**: 
- DB: New `training_progress` table (user_id, module_id, completed_at, quiz_score)
- Content: Training material and quiz questions (requires PRDF subject matter input)

**OPEN QUESTION**: What constitutes a "pass"? What happens on failure — retry or escalate?

### Phase 8: Provincial and Demographic Data Capture (A8, A9)

**Goal**: Add data fields required for regulatory reporting.

DB schema changes needed:
```sql
ALTER TABLE clients ADD COLUMN province text;
ALTER TABLE clients ADD COLUMN gender text;
ALTER TABLE clients ADD COLUMN is_hdp boolean DEFAULT false;
ALTER TABLE clients ADD COLUMN is_disabled boolean DEFAULT false;
ALTER TABLE clients ADD COLUMN area_type text; -- 'urban', 'peri-urban', 'rural'
```

Province values: Eastern Cape, KwaZulu-Natal, Gauteng, (and other SA provinces).

Admin UI changes:
- Add province, gender, HDP, disability, area_type fields to application detail view
- Make these editable by LoanOfficer and Admin during review
- Add province and demographic filters to ApplicationsPage

Client UI changes (cross-reference with client-ui spec):
- Add province and demographic fields to ApplyPage wizard (Business Profile step)

### Phase 9: Notification Template Management (A10)

**Goal**: Admin UI to manage notification templates.

Route: `/settings/notifications` — Admin only.

Features:
- List all notification templates from `notification_templates` table
- Edit template title and body (with variable placeholders)
- Enable/disable templates
- Preview rendered template

### Phase 10: Audit Log Viewer (A11)

**Goal**: Admin UI to search and view audit records.

Route: `/audit` — Admin only.

Features:
- Searchable/filterable table of audit_log entries
- Filter by entity type, action, actor, date range
- Detail view showing full metadata JSON

### Phase 11: Responsive Pass (A15)

**Goal**: Systematic responsive testing and fixes.

Breakpoints: 360px, 480px, 768px, 1024px, 1440px

Key rules:
- Sidebar becomes drawer on mobile/tablet
- KPI cards wrap without clipping
- Application split-view becomes list-first on mobile (detail as separate view)
- Tables collapse to card rows where column density breaks readability
- Filters stack above tables on mobile

---

## 4. Delivery Order

| Order | Phase | Effort | Dependencies |
|-------|-------|--------|--------------|
| 1 | Phase 1: Design System and Shell | Medium | None |
| 2 | Phase 2: Page Visual Updates | Large | Phase 1 |
| 3 | Phase 3: SLA Tracking | Small | Phase 2 (no DB changes) |
| 4 | Phase 8: Provincial/Demographic Data | Medium | DB migration |
| 5 | Phase 4: SEDFA/NCR Reporting | Large | Phase 8 (needs province/demographic data), backend queries |
| 6 | Phase 5: Collections Management | Large | DB schema, product decisions |
| 7 | Phase 6: Interest Rate and Refunds | Medium | DB migration |
| 8 | Phase 7: Intern Onboarding | Medium | DB schema, training content |
| 9 | Phase 9: Notification Templates | Small | None |
| 10 | Phase 10: Audit Log Viewer | Small | None |
| 11 | Phase 11: Responsive Pass | Medium | All phases |

---

## 5. Cross-Dependencies with Client-UI

| Admin Feature | Client-UI Impact |
|---------------|-----------------|
| Phase 8 (Provincial/Demographic data) | Client ApplyPage must capture province, gender, HDP, disability, area_type in Business Profile step |
| Phase 4 (Reporting) | No direct client impact, but data captured in client apply flow feeds reports |
| Phase 3 (SLA Tracking) | Client StatusPage could show estimated processing time |
| Phase 9 (Notification Templates) | Client receives notifications defined by admin templates |

---

## 6. Open Questions (Require Product Decisions)

1. **SLA enforcement**: When an application exceeds 5 working days, should it auto-close, auto-escalate, or just show a red indicator for manual action?
2. **Provincial list**: Should all 9 SA provinces be options, or only Eastern Cape, KZN, and Gauteng (the three mentioned in requirements)?
3. **Debit order provider**: Which banking/payment provider will PRDF integrate with for debit order collections?
4. **Report delivery**: Should reports be viewable in-app only, or also exportable as PDF/CSV for SEDFA and NCR submission?
5. **Intern training content**: Who provides the training material and quiz questions? Is there existing content?
6. **Demographic sensitivity**: How should demographic data (gender, HDP, disability) be collected — self-reported by client, or captured by admin during review?
7. **Provision for doubtful debt**: How is the provision percentage calculated? Is there a standard PRDF policy?
8. **Write-off authority**: Which roles can authorize loan write-offs? Admin only, or LoanOfficer+Admin?
9. **Interest rate changes**: Should rate changes apply to existing schedule only, or recalculate all future installments?
10. **SEDFA communication**: What format does SEDFA expect? Is there an API, email template, or manual upload process?
