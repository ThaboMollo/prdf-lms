# PRDF Admin UI — Redesign Implementation Tickets

Actionable backlog for the design in [`flow-redesign-spec.md`](./flow-redesign-spec.md).
Board reference: https://claude.ai/code/artifact/919a6e43-ceb9-4cb5-999a-be3013fd1073

**Legend** — Effort: `S` ≤½day · `M` ~1–2 days · `L` ~3–5 days.
**Definition of Done (every ticket):** `tsc` clean · unit/RTL tests where logic added · `/verify` drives the flow end-to-end · light **and** dark themes checked · mobile (≤980px) checked · keyboard focus states visible · no dead links introduced.

---

## Dependency overview

```
E0 Foundations ─┬─▶ E1 Nav & drill ─┬─▶ E2 Pipeline ─▶ E3 Case ─┬─▶ E4 Money tab
                │                   │                           └─▶ E5 Documents preview
                │                   └─▶ E6 Loans + Portfolio links
                ├─▶ E7 Reports (parallel after E0)
                └─▶ E8 User Access (parallel after E0)
E9 Cutover & cleanup ── after E1–E8
```
Prereqs flagged **⚠ backend** must land (or be stubbed) before their consuming ticket.

---

## E0 — Foundations (design system & shared components)

### ADM-001 · Refine colour tokens & both-theme audit — `M`
- **Files:** `src/styles/global.css`
- Add/align tokens from spec §5.1 (`--ground`, `--panel`, `--ink*`, `--hair*`, `--accent`, semantic good/warn/crit) for light + dark; add categorical chart tokens `--cat1..4` (both modes, values from spec §5.2).
- **AC:** every existing screen renders unchanged structurally but on the refined palette; dark mode has no hard-coded light colours; contrast ≥ 4.5:1 for body text in both themes.

### ADM-002 · `Breadcrumbs` component — `S`
- **Files:** new `src/components/shared/Breadcrumbs.tsx`; consumed by `Topbar.tsx`.
- Renders `Dashboard › <section> › <entity>` from a prop or route context; last crumb non-link.
- **AC:** appears in the topbar on every routed page; each non-terminal crumb navigates; truncates gracefully on mobile.

### ADM-003 · `LifecycleRail` component — `M`
- **Files:** new `src/components/shared/LifecycleRail.tsx`; uses `packages/domain/status.ts`.
- Beads for `Draft → Submitted → Review → Approved → Disbursed → Repaying → Closed`; done/current/future states; `Rejected` = red terminal bead; `InfoRequested` annotates current step.
- **AC:** given any `LoanApplicationStatus`, correct bead is "current" and prior beads "done"; unit test covers each enum value incl. Rejected/Closed.

### ADM-004 · `ConfirmDialog` (`showConfirm`) — `S`
- **Files:** new `src/components/shared/ConfirmDialog.tsx` (or hook `useConfirm`).
- Title, body, ok label, `danger` variant, `onConfirm`; focus-trapped, Esc/scrim to cancel.
- **AC:** reusable; keyboard accessible (focus moves to primary, returns to trigger on close); danger variant styled red. Replaces the bespoke modal in `UserAccessPage`.

### ADM-005 · Make `KPIStatCard` linkable — `S`
- **Files:** `src/components/shared/KPIStatCard.tsx`
- Add optional `to?: string`; when present render as `<Link>`/button with hover-lift + arrow affordance; keep static variant when absent.
- **AC:** a KPI with `to` navigates; without `to` behaves exactly as today; a11y — interactive card is a real link/button.

### ADM-006 · `EntityLink` helper + status pill consolidation — `S`
- **Files:** new `src/components/shared/EntityLink.tsx`; audit `StatusBadge.tsx`.
- `EntityLink` renders loan/application/client ids as links to their canonical route; SLA badge extracted from `ApplicationsPage` inline style into a shared `SlaBadge`.
- **AC:** loan/app ids never render as plain text post-migration; SLA badge reused by Dashboard, Pipeline, Case.

---

## E1 — Navigation & drill-down plumbing

### ADM-010 · Fix the dead `/loans` nav entry & route table — `S`
- **Files:** `src/app/layout/navigation.ts`, `src/App.tsx`
- Add real routes: `/pipeline`, `/case/:id`, `/loans` (screens land in later epics — wire routes to placeholder pages first). Point the existing `/loans` nav item at the real route.
- **AC:** no nav item resolves to the `*`→dashboard fallback; role-gating on new routes matches spec §3.1.

### ADM-011 · Topbar breadcrumbs wired to routes — `S` · _dep: ADM-002, ADM-010_
- **Files:** `src/app/layout/Topbar.tsx`, `AppShell.tsx`
- Derive breadcrumb trail from the active route + entity.
- **AC:** every screen shows correct crumbs; back navigation via crumb works from a deep case.

### ADM-012 · Case drawer (right slide-in) — `M` · _dep: ADM-003_
- **Files:** new `src/components/shared/CaseDrawer.tsx`; state host in `AppShell.tsx` or a context.
- Opens from a case id; shows lifecycle, linked-loan card, quick actions, and **Open full case →** (`/case/:id`). Scrim + Esc close.
- **AC:** openable from Dashboard & Pipeline; `Open full case` routes to the case; focus management correct.

### ADM-013 · Dashboard blocks & rows become links — `M` · _dep: ADM-005, ADM-012_
- **Files:** `src/pages/DashboardPage.tsx`
- KPI tiles → `/pipeline?status=…` (Pipeline/UnderReview/InfoRequested/SLA). Queue & task rows → open the case drawer (or `/case/:id`). Show business/client name, not sliced UUID.
- **AC:** each KPI opens the matching filtered pipeline; each queue row opens its case; empty states preserved.

---

## E2 — Pipeline

### ADM-020 · `/pipeline` list with URL-driven filters — `M` · _dep: ADM-010, ADM-006_
- **Files:** new `src/pages/PipelinePage.tsx`; reuse filter logic from `ApplicationsPage.tsx`.
- Filter chips (All open / Under Review / Info Requested / Approved / SLA) bound to `?status=`; search bound to `?q=`; pagination preserved.
- **AC:** deep link `/pipeline?status=UnderReview` loads pre-filtered; back button restores prior filter; rows open the case drawer.

### ADM-021 · Retire the Applications list half — `S` · _dep: ADM-020, ADM-030_
- **Files:** `src/pages/ApplicationsPage.tsx`, `src/App.tsx`, `navigation.ts`
- `/applications` → redirect to `/pipeline` (keep client-ui usage untouched). Remove the internal list UI once Pipeline + Case cover it.
- **AC:** `/applications` redirects; no functionality lost for internal roles; client-ui unaffected.

---

## E3 — Case workspace (the merge)

### ADM-030 · `/case/:id` shell: header, lifecycle, tabs — `L` · _dep: ADM-003, ADM-011_
- **Files:** new `src/pages/CasePage.tsx`; lift detail subcomponents out of `ApplicationsPage.tsx` (`DetailsTab`, `DocumentsTab`, `HistoryTab`, `TasksTab`, `NotesTab`, `NfsTab`).
- Header (business/client/amount/status), breadcrumb, `LifecycleRail`, tab bar: Overview · Documents · Money · Tasks · Notes · History · Advisory (NFS gated by `tenantConfig.features.nonFinancialSupport`). Tab state in `?tab=`.
- **AC:** all existing application data/actions reachable under the new tabs; `?tab=money` deep-links; NFS tab hidden when tenant flag off.

### ADM-031 · Left-rail: Next step + Case actions — `M` · _dep: ADM-030_
- **Files:** `CasePage.tsx`
- Context CTA per status (UnderReview→Approve/Request info; InfoRequested→Review response; Approved→**Prepare disbursement**; InRepayment→Record repayment). Assign-to (`listAssignableUsers` + `assignApplication`), change status (`allowedNextStatuses` + `transitionStatus`), request info.
- **AC:** actions reuse existing use cases; status transitions respect `packages/domain/status.ts`; Approved shows a working Prepare-disbursement CTA (closes break #6).

---

## E4 — Money tab (loan merged in)

### ADM-040 · Fold `LoanDetailsPage` into the Money tab — `L` · _dep: ADM-030_
- **Files:** `CasePage.tsx`, retire `src/pages/LoanDetailsPage.tsx`; reuse `logic/usecases/loans`, `useFormErrors`.
- When a loan exists: Disburse + Record-repayment forms (keep **separate** `useFormErrors` instances — see current LoanDetailsPage rationale), schedule + repayments tables. When none: Prepare-disbursement panel that creates the loan.
- **AC:** disburse/repay parity with today incl. per-form error isolation; schedule & repayments paginate; loan summary mini-KPIs render in the left rail.

### ADM-041 · Redirect `/loan/:loanId` → `/case/:id?tab=money` — `S` · _dep: ADM-040_
- **Files:** `src/App.tsx`; needs loan→application/case mapping (from loan detail payload).
- **AC:** old loan links/bookmarks resolve to the case Money tab; no orphaned route.

---

## E5 — Documents inline preview

### ADM-050 · ⚠ Signed-URL embedding contract — `S`
- **Files:** `src/logic/usecases/documents`, `src/lib/data/adapters/api/documents.api.ts`, `src/lib/api.ts`; **⚠ backend** confirm `Content-Type`/`Content-Disposition: inline` and CSP `frame-src`/`img-src` allow the storage origin.
- **AC:** a signed doc URL renders in an `<iframe>`/`<img>` without forcing download; documented allowed content types (PDF, PNG, JPG).

### ADM-051 · Documents split preview UI — `M` · _dep: ADM-030, ADM-050_
- **Files:** `CasePage.tsx` Documents tab.
- Left checklist (`useDocumentRequirements` + `DOCUMENT_LABELS`) with status dots; right preview pane (type tag, name, uploader/date, status pill, embedded doc); action bar **Download · Verify · Reject** (`verifyDocument`/`rejectDocument`); Missing → upload prompt in place of preview.
- **AC:** selecting a doc previews it inline; verify/reject update status without a full reload; missing docs offer upload; no `window.open` in the happy path.

---

## E6 — Loans & Portfolio

### ADM-060 · ⚠ Loans list endpoint + data layer — `M`
- **Files:** **⚠ backend** `GET /loans` (id, applicationId, borrower, principal, outstanding, nextDueDate, status, daysInArrears) with RLS; `src/lib/api.ts`, `reports`/new `loans` repo + usecase.
- **AC:** endpoint returns the loan list for authorised roles only; typed client method added; empty/error states defined.

### ADM-061 · `/loans` list page — `M` · _dep: ADM-060, ADM-010_
- **Files:** new `src/pages/LoansPage.tsx`.
- Table per spec §4.5; rows → `/case/:id?tab=money`; arrears flag; pagination.
- **AC:** the once-dead tab shows real loans; every row opens the case Money tab.

### ADM-062 · Portfolio arrears link into the case — `S` · _dep: ADM-040_
- **Files:** `src/pages/PortfolioPage.tsx`
- Arrears table `loanId` → `EntityLink` to `/case/:id?tab=money`; keep CSV export; restyle KPIs to new tokens.
- **AC:** arrears rows navigate to the loan in-case (closes break #5); export still works.

---

## E7 — Reports rebuild

### ADM-070 · Reports scaffold: categories, KPI band, time range — `M` · _dep: ADM-001_
- **Files:** `src/pages/ReportsPage.tsx`
- Category chips (All · Performance · Portfolio & Risk · Compliance · Activity) filtering the card grid; top KPI band; existing `getDateRange` time range.
- **AC:** chips filter cards; all current queries still fire; layout responsive.

### ADM-071 · Theme Recharts to the design tokens — `M` · _dep: ADM-001, ADM-070_
- **Files:** `ReportsPage.tsx`, small chart-theme helper.
- Replace hard-coded chart colours (`#4f46e5`, `#10b981`, `#6366f1`, `#eee`) with token-driven values; single-series = accent, categorical (gender/spatial) = `--cat*`; recessive grid; tooltips/legend per dataviz rules; **validate categorical palette** with `scripts/validate_palette.js` for both modes.
- **AC:** charts legible in light + dark; no raw hex in chart props; categorical palette passes the validator.

### ADM-072 · Report cards to categories (parity) — `M` · _dep: ADM-070_
- **Files:** `ReportsPage.tsx`
- Slot existing reports into categories (spec §7): pipeline/origination/conversion/turnaround; debtors-age/PAR; demographic/province/spatial; productivity/audit; Export Center. Compliance cards badged NCR/SEDFA.
- **AC:** every live report present and categorised; Export Center downloads all existing CSVs (`handleExportCsv`).

### ADM-073 · Proposed new reports — `M` _(optional, post-parity)_ · _dep: ADM-072_
- Collections performance · Cohort/vintage · Officer scorecard · Concentration risk. **⚠ backend** aggregation endpoints per report.
- **AC:** each new report gated behind its endpoint; degrade to empty state if unavailable.

---

## E8 — User Access

### ADM-080 · User Access restyle + confirm dialog — `M` · _dep: ADM-001, ADM-004_
- **Files:** `src/pages/UserAccessPage.tsx`
- KPI band (Visible/Internal/Clients/Admins); user-type + role filters (existing `listAdminUserAccess`); role-reference strip; table with removable chips, assign select, Reset MFA. Swap bespoke modal for `ConfirmDialog`.
- **AC:** all three actions (assign/remove/reset-MFA) confirm first; **permission model unchanged** — Admin chip × and Reset MFA appear only for SuperAdmin, never on self; mutations + cache invalidation identical to today; Reset MFA dialog shows the red security warning.

---

## E9 — Cutover & cleanup

### ADM-090 · Remove dead code & routes — `S` · _dep: E1–E8_
- Delete `LoanDetailsPage.tsx` once E4 lands; remove Applications internal list once E2/E3 land; prune unused styles.
- **AC:** no unreferenced pages/components; bundle has no orphaned routes.

### ADM-091 · Redirects & bookmark safety — `S` · _dep: ADM-021, ADM-041_
- Confirm `/applications`→`/pipeline` and `/loan/:id`→`/case/:id?tab=money` redirects; add a catch for legacy query params.
- **AC:** old links resolve; no 404/blank.

### ADM-092 · Full-flow regression via `/verify` — `M` · _dep: E1–E8_
- Drive the spine end-to-end: Dashboard block → Pipeline → Case → Approve → Prepare disbursement → Money → repayment; Portfolio arrears → Case; User Access assign/remove/reset with confirms.
- **AC:** each hop navigates and stays in sync; both themes; mobile; no console errors.

---

## Suggested sequencing (by sprint)

1. **Sprint 1 — Foundations & spine:** E0 (ADM-001..006), E1 (ADM-010..013).
2. **Sprint 2 — Pipeline & Case:** E2, E3.
3. **Sprint 3 — Money & Documents:** E4, E5 (start ⚠ backend ADM-050/060 early).
4. **Sprint 4 — Loans, Portfolio, Reports:** E6, E7.
5. **Sprint 5 — User Access, cutover:** E8, E9.

## Cross-cutting risks / prereqs

- **⚠ ADM-050** — document embedding needs correct storage `Content-Type` + CSP (`frame-src`/`img-src`).
- **⚠ ADM-060** — Loans list endpoint + RLS is net-new backend; blocks `/loans`.
- **⚠ ADM-073** — new report aggregations are net-new backend; keep behind feature/empty-state guards.
- Two backends exist (see `platform-architecture-design.md` / infra fork plan) — confirm which serves prod before wiring new endpoints.
