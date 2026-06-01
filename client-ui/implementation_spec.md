# Client-UI Implementation Specification

This spec covers both design implementation (visual/UX updates) and functional implementation (new features required by the LMS Functionality Requirements). It audits what currently exists in code vs what is required.

Design source: `untitled.pen` — Client screens (Landing, Dashboard, Apply Wizard, Login, Status, Documents)
Design plan: `docs/client-ui-design-implementation-plan.md`
Requirements source: `docs/LMS Functionality Requirements.md`

---

## 1. Current State Audit

### 1.1 Existing Routes

| Route | Page | Status |
|-------|------|--------|
| `/` | LandingPage | EXISTS — hero, calculator, trust section |
| `/login` | LoginPage | EXISTS — split auth layout with brand panel |
| `/register` | RegisterPage | EXISTS — registration form |
| `/home` | HomePage | EXISTS — greeting, active app card, KPIs, activity |
| `/apply` | ApplyPage | EXISTS — 5-step wizard with draft persistence |
| `/status` | StatusPage | EXISTS — vertical timeline milestones |
| `/documents` | DocumentsPage | EXISTS — required docs + uploaded files |
| `/dashboard` | redirect to `/home` | EXISTS |
| `/applications` | redirect to `/apply` | EXISTS |

### 1.2 Existing Components

| Component | File | Status |
|-----------|------|--------|
| LoanCalculator | `components/shared/LoanCalculator.tsx` | EXISTS |
| PublicNav | `components/shared/PublicNav.tsx` | EXISTS |
| WizardProgress | `components/shared/WizardProgress.tsx` | EXISTS |
| WizardCostCard | `components/shared/WizardCostCard.tsx` | EXISTS |
| FileDropzone | `components/shared/FileDropzone.tsx` | EXISTS |
| ChipSelect | `components/shared/ChipSelect.tsx` | EXISTS |
| AddressFields | `components/shared/AddressFields.tsx` | EXISTS |
| FieldError | `components/shared/FieldError.tsx` | EXISTS |
| KPIStatCard | `components/shared/KPIStatCard.tsx` | EXISTS |
| StatusBadge | `components/shared/StatusBadge.tsx` | EXISTS |
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
- `RequireRole` — role-based route protection (currently `['Client']`)
- `RequireClientProgress` — ensures client has completed onboarding before accessing certain routes
- `CalculatorProvider` — carries loan calculator state across routes (amount, term)

---

## 2. Gap Analysis: Requirements vs Code

### 2.1 IMPLEMENTED (exists in code, may need design updates only)

| Requirement | Code Location | Notes |
|-------------|---------------|-------|
| Digitise loan lifecycle (apply to disburse to repay) | Full route + data layer | Core flow works end to end |
| Client registration and login | LoginPage, RegisterPage | Functional with Supabase auth |
| Application submission with save/continue | ApplyPage (5-step wizard) | Draft persistence via createDraft/updateDraft |
| Document upload and checklist | DocumentsPage + FileDropzone | 6 required doc types defined in `lib/requirements.ts` |
| Application status tracking | StatusPage with 6 milestones | Submitted, UnderReview, Approved, Disbursed, InRepayment, Closed |
| Client alerts on receipt of application | notifications usecase | listNotifications + markRead in data layer |
| Track progress from client interface | StatusPage + HomePage | Active app card + timeline |

### 2.2 NOT IMPLEMENTED (required by LMS Functionality Requirements)

| ID | Requirement | Priority | Details |
|----|-------------|----------|---------|
| G1 | **Eligibility Pre-Screening** | HIGH | Requirements list specific criteria: >50.1% black women owned, SA nationals, CIPC registered, SARS tax clearance, not under debt review, director operational, demonstrate sustainability, capacity to repay. NO pre-screening questionnaire or eligibility check exists before application. |
| G2 | **Non-Financial Support Interface** | HIGH | Entire domain missing. Requirements list: Business Health Assessment, Compliance support, Business Skills/Business Plan, Monthly Funding Readiness Webinars, Loan Readiness Webinars, Marketing and Branding Collateral, SARS support (tax returns, VAT, CIPC deregistration), Industry affiliations. No pages, data layer, or components exist for any of this. |
| G3 | **Language Flexibility (English/Zulu)** | MEDIUM | No i18n framework. All UI is English-only. Requirements ask: "Can portal offer language flexibility English, Zulu?" |
| G4 | **Human-Readable Reference Numbers** | MEDIUM | Requirements say "generate reference number on completion" and "provide customer number". App uses UUIDs internally. No human-readable reference number (e.g., PRDF-2026-00042) is generated or displayed. |
| G5 | **Onboarding Questionnaire for NFS** | HIGH | Requirements state non-financial support is part of onboarding. Clients must answer questions and register for NFS services before or during application. For startups, the system must enable registration for non-financial support. No questionnaire or NFS registration flow exists. |
| G6 | **Document Checklist BEFORE Application** | MEDIUM | Requirements say "access checklist of required documents, collate documents prior to populating application". Current DocumentsPage only works post-application. No pre-application checklist view exists. |
| G7 | **Client Repayment View** | MEDIUM | Requirements say clients should "view repayment information after approval and disbursement". Files `PortfolioPage.tsx` and `LoanDetailsPage.tsx` exist in client-ui source but are NOT routed in App.tsx. No client-facing repayment schedule, payment history, or outstanding balance page is accessible. |
| G8 | **Specific Notification Stage Alerts** | MEDIUM | Requirements list specific stages: application met admin requirements, at adjudication, additional info requested, approved (process: meeting with PRDF), declined (reasons + re-apply). Current notification system is basic list + mark read. No stage-specific templates are wired to status transitions. |
| G9 | **Client Profile / Account Settings** | LOW | No dedicated profile/settings page for client to view or edit their personal information, notification preferences, or account details. The `user_preferences` table exists in DB but has no UI. |
| G10 | **Responsive / Mobile-First** | HIGH | Requirements say "Accessibility: web, desktop, tablet or mobile". Current CSS has some responsive rules but no systematic responsive testing or mobile-optimized layout has been verified. |

### 2.3 EXISTS IN DATABASE BUT NOT WIRED IN CLIENT UI

| DB Table | Status in Client UI |
|----------|-------------------|
| `loan_products` | Not used. No product selection UI. Application goes straight to amount/term. |
| `document_requirements` | Not used. Doc types are hardcoded in `lib/requirements.ts` instead of reading from DB. |
| `user_preferences` | Not used. No notification preferences UI for clients. |
| `loans` / `repayment_schedule` / `repayments` | Repository and adapter exist (`loans.repo.ts`, `reports.repo.ts`) but no client-facing page is routed. |
| `audit_log` | Not exposed to client (correct behavior — admin only). |
| `notification_templates` | Templates table exists but no client UI consumes typed notifications. |

---

## 3. Implementation Plan

### Phase 1: Design System and Shell Updates

**Goal**: Apply the new Aerial Gravitas visual design from `untitled.pen`.
**Ref**: `docs/client-ui-design-implementation-plan.md` — Phases 1-2

Files to modify:
- `src/styles/global.css` — Add font imports (Anton, Inter, Geist, IBM Plex Mono), update CSS variables for brand colors, shadows, border radius, typography scale
- `src/app/AppShell.tsx` — Update shell layout to match design (dark sidebar, compact top bar)
- `src/app/layout/Sidebar.tsx` — Dark blue sidebar (`--sidebar-bg: #1e3a8a`) with lucide icon + label nav items, active state highlight
- `src/app/layout/Topbar.tsx` — Compact 64px top bar with PRDF logo (Anton), nav links, avatar circle
- `src/components/shared/PublicNav.tsx` — Update to match landing page dark nav bar with Apply CTA button

New CSS variables to define:
```
--font-heading: 'Anton', sans-serif
--font-body: 'Inter', sans-serif
--font-caption: 'Geist', sans-serif
--font-data: 'IBM Plex Mono', monospace
--shadow-sharp: 0 4px 8px rgba(0,0,0,0.5)
--radius-sm: 4px
```

Acceptance criteria:
- All screens use the new 4-font typography hierarchy
- Sidebar and top bar match the Pencil designs
- Existing functionality is not broken
- Mobile sidebar collapses to drawer

### Phase 2: Page Visual Updates

**Goal**: Update each existing page to match the new Pencil designs.
**Ref**: `docs/client-ui-design-implementation-plan.md` — Phases 1, 3-6

| Page | Key Visual Changes |
|------|-------------------|
| LandingPage | Anton headline at 64px, asymmetric hero split (640px copy / 420px calculator card), Geist eyebrow labels (uppercase, tracked), trust pills with shadow, dark trust section with icon circles |
| LoginPage | Split horizontal: 560px dark brand panel (Anton headline, check bullets, loan preview) + fill-width white form panel (centered 380px form container) |
| RegisterPage | Same split-screen pattern as login |
| HomePage | Anton greeting at 32px, active application card with 4px left blue border accent, KPI stat cards with Geist labels and Anton/IBM Plex Mono values, recent activity list with top-border row separators |
| ApplyPage | Stepper with done-check/active-number/pending-grey circles connected by lines, Geist uppercase field labels, term chip selector, two-column layout (form left + cost breakdown card right with sharp shadow) |
| StatusPage | Vertical timeline with 24-28px circles (blue filled check for done, blue dot for active, grey for pending) connected by 2px lines, card container with eyebrow reference number |
| DocumentsPage | Two-column grid: left card with required docs rows showing pill status badges (Uploaded/Missing/Pending Review), right card with file rows (icon + name + metadata) and dashed-border dropzone |

### Phase 3: Eligibility Pre-Screening (G1)

**Goal**: Add eligibility questionnaire before loan application.

New files:
- `src/pages/EligibilityPage.tsx` — Multi-question eligibility form
- `src/features/eligibility/questions.ts` — Question definitions with pass/fail rules
- `src/features/eligibility/validation.ts` — Eligibility evaluation logic

Route: `/eligibility` — Protected, between landing and apply flow.

Questions to capture (derived from requirements):
1. Is the enterprise >50.1% black women owned? (Y/N)
2. Are applicants 90%+ South African nationals with SA-controlled operations? (Y/N)
3. Is the enterprise 100% director operational? (Y/N)
4. Is the business registered with CIPC? (Y/N)
5. Is the business registered with SARS with valid tax clearance or tax pin? (Y/N)
6. Are members/shareholders free from insolvency, debt review, or administration orders? (Y/N)
7. Does the project demonstrate targets for employment creation? (Y/N)
8. Does the business demonstrate capacity to repay the loan? (Y/N)
9. Is the applicant willing to participate in developmental programs? (Y/N)
10. Is the applicant a permanent resident of South Africa? (Y/N)
11. (Conditional — rural provinces) Does the project have rural community participation? (Y/N)

Flow: Landing -> Eligibility -> Apply Wizard (proceed only if eligible)

**OPEN QUESTION**: What happens on failure? Hard block with reasons, advisory warning, or redirect to NFS?

### Phase 4: Non-Financial Support Interface (G2, G5)

**Goal**: Build the non-financial support registration and access portal.

New files:
- `src/pages/SupportHubPage.tsx` — NFS services hub showing available programs
- `src/pages/BusinessHealthAssessmentPage.tsx` — Assessment questionnaire
- `src/features/nfs/services.ts` — Service type definitions
- `src/logic/usecases/nfs/index.ts` — NFS use cases
- `src/lib/data/repositories/nfs.repo.ts` — NFS repository
- `src/lib/data/adapters/supabase/nfs.supabase.ts` — NFS Supabase adapter

Routes:
- `/support` — Non-financial support hub listing all programs
- `/support/assessment` — Business health assessment questionnaire

Services to display (from requirements):
1. Business Health Assessment
2. Compliance Requirements Support
3. General Business Skills / Business Plan
4. Monthly Funding Readiness Webinars (with registration)
5. Loan Readiness Webinars (with registration)
6. Marketing and Branding Collateral (partner links)
7. SARS Support (tax returns, VAT registration, CIPC deregistration)
8. Industry Affiliations

Sidebar nav: Add "Support" item between Documents and Status.

**REQUIRES**: New DB table(s) for NFS registrations and program tracking. Schema TBD based on product decisions about what "registration" means for each service type.

**OPEN QUESTIONS**:
- Which services are online vs physical delivery?
- How is webinar registration tracked? External link or in-system?
- Is a completed NFS assessment required before loan application (per requirements: "Only compliant clients can move to Loan application")?

### Phase 5: Client Repayment View (G7)

**Goal**: Let clients view their loan repayment information post-disbursement.

Files to modify:
- `src/App.tsx` — Add routes for `/loans` and `/loans/:id`

Files to activate (exist but not routed):
- `src/pages/PortfolioPage.tsx` — Client loan overview
- `src/pages/LoanDetailsPage.tsx` — Individual loan details

New/updated components:
- Repayment schedule table showing installment_no, due_date, due_total, paid_amount, status
- Payment history list from `repayments` table
- Outstanding balance summary

Data: `loans.repo.ts` and `reports.repo.ts` already exist with Supabase adapters. Wire into the pages.

Sidebar nav: Add "Loans" item (visible only when client has active loans).

### Phase 6: Reference Number Generation (G4)

**Goal**: Generate human-readable reference numbers for applications.

Implementation:
- DB: Add `reference_number` column to `loan_applications` (e.g., format `PRDF-2026-00042`)
- DB: Create trigger or function to auto-generate on insert
- API types: Add `referenceNumber` to `ApplicationSummary` and `ApplicationDetails`
- UI: Replace all `app.id.slice(0, 8)` displays with the reference number
- Affected pages: StatusPage (timeline card eyebrow), HomePage (activity list), DocumentsPage (app selector)

**OPEN QUESTION**: What format? `PRDF-YYYY-NNNNN`? Should it include province code?

### Phase 7: Document Checklist Pre-Application (G6)

**Goal**: Let clients review required documents before starting the application.

Implementation options:
- Option A: Add a "Document Readiness" step as Step 0 or pre-screen in the apply flow
- Option B: Make DocumentsPage accessible without an active application, showing just the requirements checklist

Additionally:
- Read document requirements from DB (`document_requirements` table) instead of hardcoded `lib/requirements.ts`
- This enables per-product document requirements in the future

### Phase 8: Enhanced Notifications (G8)

**Goal**: Implement specific notification stage alerts matching requirements.

Notification types to implement:
1. `application_received` — "Your application has been received and is being processed"
2. `admin_requirements_met` — "Your application has met all administrative requirements"
3. `at_adjudication` — "Your application is currently at adjudication"
4. `additional_info_requested` — "Additional information is required for your application"
5. `application_approved` — "Your application has been approved" (include: meeting process details)
6. `application_declined` — "Your application has been declined" (include: reasons, re-apply link)

Data: Populate `notification_templates` table with templates for each type.
Backend: Trigger notifications on `application_status_history` inserts.
UI: Add notification bell icon in top bar with unread count badge and dropdown list.

### Phase 9: Language Support (G3)

**Goal**: Add English/Zulu language toggle.

Implementation:
- Add `react-i18next` dependency
- Create `src/i18n/en.json` and `src/i18n/zu.json` translation files
- Extract all UI strings from all pages and components
- Add language selector in PublicNav (public pages) and Topbar (authenticated pages)
- Persist preference in `user_preferences` table or localStorage

Phasing suggestion: Start with highest-traffic pages (Landing, Login, Apply) then expand.

**OPEN QUESTION**: Who provides Zulu translations? Professional translation service needed.

### Phase 10: Responsive Pass (G10)

**Goal**: Systematic responsive testing and fixes for all breakpoints.

Breakpoints: 360px, 480px, 768px, 1024px, 1440px

Key responsive rules:
- Sidebar becomes slide-out drawer on mobile (< 768px)
- Hero section stacks vertically on mobile (copy above calculator)
- Login split-screen stacks vertically on mobile (brand panel above form)
- Dashboard KPI cards stack in single column on mobile
- Wizard cost card moves below form on mobile
- Document grid stacks to single column on mobile
- Status timeline remains single column (already responsive-friendly)

---

## 4. Files That Exist But Are Not Routed

| File | Status | Action |
|------|--------|--------|
| `pages/ApplicationsPage.tsx` | Not routed — redirect to `/apply` exists | Keep redirect, repurpose file for applications list if needed |
| `pages/DashboardPage.tsx` | Not routed — redirect to `/home` exists | Keep redirect |
| `pages/PortfolioPage.tsx` | Not routed | Wire in Phase 5 |
| `pages/LoanDetailsPage.tsx` | Not routed | Wire in Phase 5 |

---

## 5. Delivery Order

| Order | Phase | Effort | Dependencies |
|-------|-------|--------|--------------|
| 1 | Phase 1: Design System and Shell | Medium | None |
| 2 | Phase 2: Page Visual Updates | Large | Phase 1 |
| 3 | Phase 3: Eligibility Pre-Screening | Medium | Phase 2, DB schema change |
| 4 | Phase 5: Client Repayment View | Small | Phase 1 (wire existing code) |
| 5 | Phase 6: Reference Numbers | Small | DB migration |
| 6 | Phase 7: Document Checklist Pre-App | Small | Phase 2 |
| 7 | Phase 8: Enhanced Notifications | Medium | DB templates, backend triggers |
| 8 | Phase 4: Non-Financial Support | Large | DB schema, product decisions needed |
| 9 | Phase 9: Language Support | Large | All phases complete (string extraction) |
| 10 | Phase 10: Responsive Pass | Medium | All phases |

---

## 6. Open Questions (Require Product Decisions)

1. **Eligibility failure**: What happens when a client fails eligibility? Hard block, advisory warning, or redirect to Non-Financial Support?
2. **NFS compliance gate**: Requirements say "Only compliant clients can move to Loan application". Does this mean NFS registration/assessment must be completed before applying?
3. **NFS service delivery**: Which services are online (webinars) vs physical (seminars)? How is registration tracked — external links or in-system?
4. **Zulu translations**: Who provides the translations? Professional translation service or internal staff?
5. **Reference number format**: What format? `PRDF-YYYY-NNNNN`? Province prefix? Sequential or random?
6. **Client repayment view**: Should clients see full amortization schedule, or just next payment and balance?
7. **Notification channels**: Requirements mention SMS and email beyond InApp. Which channels to implement and in what order?
8. **Developmental impact fields**: The eligibility criteria mention "developmental impact" and "employment creation targets". How are these captured — free text, structured fields, or separate assessment?
