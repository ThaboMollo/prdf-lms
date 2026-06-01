# Client UI Design Implementation Plan

This plan translates the client-facing screens in `untitled.pen` into implementation work for `client-ui`.

Design source:

- `Client - Landing Page`
- `Client - Dashboard`
- `Client - Apply Wizard`
- `Client - Application Status`
- `Client - Documents`
- `Login`

## 1. Objective

Implement the new client experience as a clear borrower self-service portal covering:

- Public landing and loan calculator
- Client login and registration entry points
- Guided dashboard/home state
- Loan application wizard
- Application status tracking
- Required document upload and document status

The implementation should preserve the design direction while fitting the existing React, Vite, Supabase, TanStack Query, and repository-layer structure.

## 2. Current Codebase Fit

Primary files and areas:

- `client-ui/src/App.tsx`
- `client-ui/src/app/layout/AppShell.tsx`
- `client-ui/src/app/layout/Sidebar.tsx`
- `client-ui/src/app/layout/Topbar.tsx`
- `client-ui/src/pages/LandingPage.tsx`
- `client-ui/src/pages/LoginPage.tsx`
- `client-ui/src/pages/RegisterPage.tsx`
- `client-ui/src/pages/HomePage.tsx`
- `client-ui/src/pages/ApplyPage.tsx`
- `client-ui/src/pages/StatusPage.tsx`
- `client-ui/src/pages/DocumentsPage.tsx`
- `client-ui/src/components/shared/*`
- `client-ui/src/styles/global.css`

Existing reusable components already align with several design needs:

- `LoanCalculator`
- `WizardProgress`
- `WizardCostCard`
- `FileDropzone`
- `StatusBadge`
- `KPIStatCard`
- `PageHeader`
- `Skeletons`
- `EmptyState`
- `ToastProvider`

## 3. Design System Targets

Use the client visual language from the Pencil variables:

- Primary brand: deep blue, using the existing `c-brand` direction
- Background: pale blue application surface
- Typography: strong condensed display only for marketing or major section titles
- Body and operational labels: highly legible sans-serif, not condensed
- Cards: restrained, low-radius, functional containers only
- Buttons: clear primary/secondary hierarchy with one main action per screen

Implementation notes:

- Keep operational text legible on forms, sidebars, status rows, and document rows.
- Avoid overusing the display type in dense workflow screens.
- Add responsive constraints before pixel-perfect tuning.
- Keep design tokens centralized in `global.css` or CSS custom properties.

## 4. Route and Information Architecture

Target route map:

- `/` public landing page
- `/login` login page
- `/register` registration page
- `/home` client dashboard
- `/apply` application wizard
- `/status` application status tracker
- `/documents` document upload and document status

Implementation tasks:

1. Confirm `DocumentsPage` is routed and visible in client navigation.
2. Keep `/dashboard` and `/applications` redirects for backward compatibility.
3. Ensure protected routes remain under `RequireAuth`, `RequireRole`, and `RequireClientProgress` where appropriate.
4. Keep client-only role assumptions explicit and aligned with `rbac.ts`.

Acceptance criteria:

- Authenticated client users can reach every designed client screen.
- Internal/admin roles cannot accidentally land in client-only workflows.
- Old route aliases redirect without broken navigation.

## 5. Screen Implementation Plan

### Phase 1: Landing and Login

Scope:

- Match the public landing page layout: top nav, hero, calculator card, feature blocks.
- Match login layout: blue brand panel plus centered auth form.
- Keep calculator inputs functional through the existing calculator context/components.

Tasks:

1. Update `LandingPage` to reflect the design hierarchy and calculator placement.
2. Update `LoginPage` and `RegisterPage` with the split brand/auth layout.
3. Reuse `PublicNav` where possible.
4. Add mobile stacking behavior for hero and auth pages.
5. Add validation and auth error states with visible messaging.

Acceptance criteria:

- Landing page works at desktop, tablet, and mobile widths.
- Calculator remains interactive and readable.
- Login/register show loading, error, and disabled submit states.

### Phase 2: Client App Shell

Scope:

- Implement the compact top bar and blue sidebar pattern from the dashboard screens.
- Ensure mobile uses a drawer or bottom-safe navigation pattern already present in the codebase.

Tasks:

1. Align `AppShell`, `Topbar`, `Sidebar`, and `MobileNavDrawer` with the new client design.
2. Add active states for Home, Applications/Apply, Documents, Status, Loans where applicable.
3. Keep account/profile affordance visible in the top bar.
4. Make the sidebar collapse or convert to drawer below tablet width.

Acceptance criteria:

- Navigation is consistent across client protected pages.
- Active nav state is visible.
- No horizontal overflow on mobile.

### Phase 3: Client Dashboard

Scope:

- Build the dashboard from the `Client - Dashboard` design: greeting, current application summary, KPI cards, recent activity.

Tasks:

1. Update `HomePage` with the greeting and primary application panel.
2. Reuse `KPIStatCard` for summary metrics.
3. Surface next best action: continue application, upload document, or view status.
4. Render recent activity from application/status/document data where available.
5. Add empty state for clients with no application.

Acceptance criteria:

- Dashboard answers: "What is my current loan/application state?"
- One primary action is prominent.
- Loading, empty, error, and no-permission states are visible.

### Phase 4: Application Wizard

Scope:

- Implement the `Client - Apply Wizard` flow with step progress, loan details form, financials, business details, documents, and review.

Tasks:

1. Refactor `ApplyPage` into explicit wizard sections if not already separated.
2. Use `WizardProgress` for step state.
3. Use `WizardCostCard` for the persistent debt breakdown.
4. Keep validation through `features/applications/validation.ts`.
5. Persist drafts through the existing applications repository.
6. Add save, continue, back, abandon, and submit states.

Acceptance criteria:

- Users can complete the wizard end to end.
- Invalid fields are inline and specific.
- Draft persistence and resuming work.
- Submission shows success feedback and navigates to status.

### Phase 5: Status Tracker

Scope:

- Implement application progress tracking from the `Client - Application Status` design.

Tasks:

1. Update `StatusPage` with the vertical status timeline.
2. Show current stage, completed stages, blocked stages, and requested action.
3. Include status-specific CTAs: upload documents, review application, contact support.
4. Include submitted application summary metadata.

Acceptance criteria:

- Users can understand where their application is and what happens next.
- Missing documents or information requests are prominent.
- Status history handles empty and error states.

### Phase 6: Documents

Scope:

- Implement required documents and uploaded files from the `Client - Documents` design.

Tasks:

1. Route `DocumentsPage` in `App.tsx`.
2. Show required document rows with statuses: uploaded, missing, expired, pending review.
3. Attach upload actions to specific missing/expired document rows, not only a generic dropzone.
4. Reuse `FileDropzone` for each selected document requirement.
5. Show upload progress, upload error, success toast, and verification state.

Acceptance criteria:

- Users know exactly which document is required.
- Users can upload for a specific requirement.
- Upload failures are recoverable without losing context.

## 6. Responsive Plan

Required breakpoints:

- Mobile: 360-480px
- Tablet: 768px
- Desktop: 1024px and 1440px

Rules:

- Sidebar becomes drawer on mobile.
- Dashboard cards stack in one column on mobile.
- Wizard summary card moves below the form on mobile.
- Status timeline remains single column on all widths.
- Document rows become stacked rows with action below metadata.

Acceptance criteria:

- No horizontal scrolling except file/table content where explicitly unavoidable.
- Primary action remains visible without layout overlap.
- Text does not overflow buttons, cards, badges, or nav items.

## 7. Required States

Each client screen must implement:

- Loading state
- Empty state
- Error state
- Permission or role restriction state
- Mutation pending state
- Success confirmation

Specific state coverage:

- Login: invalid credentials, network error, pending submit
- Dashboard: no application yet, application blocked, profile incomplete
- Wizard: validation errors, draft saved, submit failed, submit succeeded
- Status: no submitted application, more info requested, rejected, approved
- Documents: missing, expired, uploading, upload failed, uploaded, verified

## 8. Accessibility and UX Requirements

Tasks:

1. Use semantic headings in visual order.
2. Ensure form inputs have labels and error descriptions.
3. Ensure focus states are visible.
4. Keep color contrast acceptable for badges and muted text.
5. Do not rely on color alone for status.
6. Ensure keyboard navigation works through wizard steps and upload controls.

Acceptance criteria:

- Forms can be completed with keyboard only.
- Screen reader labels are meaningful for navigation and form actions.
- Status badges include text labels.

## 9. Verification Checklist

Run before considering implementation complete:

1. `npm run build` in `client-ui`
2. Manual smoke test for all routes
3. Login/register error handling
4. Application draft creation and resume
5. Application submit
6. Document upload success and failure
7. Responsive checks at 390px, 768px, 1024px, and 1440px
8. Empty/loading/error state review

## 10. Delivery Order

Recommended order:

1. Shared tokens and layout shell
2. Landing/login/register
3. Dashboard
4. Application wizard
5. Status tracker
6. Documents
7. Responsive pass
8. State/accessibility pass
9. Build and smoke verification
