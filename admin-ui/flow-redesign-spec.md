# PRDF Admin UI — Flow & Visual Redesign Spec

**Status:** Approved design direction, pre-implementation
**Scope:** `admin-ui` (internal staff console — Intern / Originator / LoanOfficer / Admin)
**Companion:** interactive board — https://claude.ai/code/artifact/919a6e43-ceb9-4cb5-999a-be3013fd1073
**Related:** `admin-ui/implementation_spec.md`, `packages/domain/status.ts`, `packages/tenant-config`

---

## 1. Why

The console today is four disconnected screens — Dashboard, Applications, Loan, Portfolio — that you move between by luck rather than by drilling down. The redesign turns them into **one connected spine**:

> **Dashboard → Pipeline → Case → Loan/Money → Payments**, where every page links to the next and every number is a door.

### 1.1 Concrete breakages this fixes

| # | Break | Where (today) |
|---|-------|---------------|
| 1 | **"Loans" nav link is dead** — routes to a page that doesn't exist, silently bounces to Dashboard | `app/layout/navigation.ts:17` lists `/loans`; `App.tsx` has no such route |
| 2 | **Dashboard blocks are dead numbers** — "Pipeline Cases", "SLA Breached" aren't clickable | `components/shared/KPIStatCard.tsx` is a plain `<article>` |
| 3 | **Queue/task rows can't be opened** | `pages/DashboardPage.tsx` `QueuePanel` renders `app.id.slice(0,8)` as text |
| 4 | **Loans are buried & one-directional** — reachable only via Applications → scroll → "View Loan", then dead-end | `pages/LoanDetailsPage.tsx` has no breadcrumb back |
| 5 | **Arrears don't reach the loan** | `pages/PortfolioPage.tsx` prints `loanId` as plain text |
| 6 | **Approved → Disbursement has no bridge** | detail panel says "move to disbursement" but offers no button |

---

## 2. Principles

1. **Every number is a door.** KPI tiles, queue rows, arrears rows, report figures all link to the thing they count.
2. **One case, its whole life.** Application and Loan are merged into a single **Case** with a lifecycle rail; nothing about a client's loan lives on a separate island.
3. **Two drill speeds.** A KPI opens a **full filtered list**; a row opens a **slide-in drawer** for triage, with an **Open full case** CTA to go deep.
4. **Read before you decide.** Documents preview inline; verify / download / reject sit under the preview — no download-just-to-look.
5. **State reads at a glance.** Status is encoded in colour *and* shape (pill, dot, severity stripe), not colour alone.
6. **Breadcrumbs everywhere.** No screen dead-ends; you always know where you are and can go back.

---

## 3. Information architecture

### 3.1 Routes

| Route | Screen | Change | Roles |
|-------|--------|--------|-------|
| `/dashboard` | Command centre | KPI blocks + queue become links | all internal |
| `/pipeline` | Case list (filterable, deep-linkable) | **NEW** — `?status=…&q=…` | all internal |
| `/case/:id` | **Case workspace** (merged application + loan) | **MERGE** of Applications detail + Loan | Originator, LoanOfficer, Admin |
| `/loans` | Loan list | **NEW** — fills the dead nav tab | LoanOfficer, Admin |
| `/portfolio` | Portfolio health + arrears | arrears rows link into the case | LoanOfficer, Admin |
| `/reports` | Reports & analytics | rebuilt (see §7) | LoanOfficer, Admin |
| `/user-access` | User & role management | unchanged surface, restyled | Admin |

**Deprecate** `/loan/:loanId` → redirect to `/case/:id?tab=money` (loan now lives inside the case). Keep the redirect so existing links/bookmarks survive.

### 3.2 Navigation model

- **Sidebar** (`app/layout/Sidebar.tsx`): Dashboard · Pipeline · Loans · Portfolio · Reports · User Access — filtered by role via `internalNavItems`. Fix the `/loans` entry to point at a real route.
- **Topbar** (`app/layout/Topbar.tsx`): breadcrumb trail + notifications + user menu. Breadcrumbs are new and reflect the drill path (e.g. `Dashboard › Pipeline › #a3f19c`).
- **Drawer**: a right-side case peek that can open from Dashboard, Pipeline, Portfolio, Loans, and search — always with **Open full case →**.

### 3.3 Drill-down map

```
Dashboard KPI block ─▶ Pipeline (filtered)
Pipeline row ─▶ Case drawer ─▶ Open full case ─▶ Case workspace
Case · Approved ─▶ Prepare disbursement ─▶ Money tab (loan created)
Loans row ─▶ Case workspace (Money tab)
Portfolio arrears row ─▶ Case workspace (Money tab)
Report figure ─▶ filtered Pipeline / Loans
Any Case/Loan ─▶ breadcrumb back to origin & client
```

---

## 4. Screens

### 4.1 Dashboard (command centre)

- **KPI band** — role-aware blocks; each is a link into `/pipeline` with a preset filter.
  - LoanOfficer/Admin: Pipeline Cases (all open) · Under Review · Info Requested · SLA Breached.
  - Intern/Originator: Applicants Assisted · Tasks Due · Create Application.
  - "Open" statuses = `Draft, Submitted, UnderReview, InfoRequested, Approved`. `SLA Breached` = pending ≥ 5 days (existing `calculateDaysElapsed` logic).
- **Queue panel** — each row links to `/case/:id`. Show business/client name (not a sliced UUID), amount, status pill, SLA badge.
- **Tasks panel** — each row links to the owning case.
- Blocks and rows both use the shared status pill + SLA badge components.

### 4.2 Pipeline (`/pipeline`) — NEW

- Filter chips: All open · Under Review · Info Requested · Approved · SLA Breached. State lives in the URL (`?status=`) so blocks deep-link here and the back button works.
- Search box (`?q=`) over business name / client / purpose (reuse existing `ApplicationsPage` filter logic).
- Rows → case drawer → **Open full case**.
- Replaces the list half of today's `ApplicationsPage`.

### 4.3 Case workspace (`/case/:id`) — MERGE (the centrepiece)

Fuses `ApplicationsPage` detail + `LoanDetailsPage` into one screen.

**Header**
- Business name, client, amount, status pill.
- Breadcrumb: `Dashboard › <origin> › #id`.
- **Lifecycle rail** across the top:
  `Draft → Submitted → Review → Approved → Disbursed → Repaying → Closed`
  - Completed steps filled; current step ringed.
  - Exception states shown as state, not extra beads: **InfoRequested** annotates the current step ("waiting on client"); **Rejected** ends the rail with a red terminal bead. (Maps the full enum in `packages/domain/status.ts`.)

**Left rail**
- **Next step** card — context-aware CTA:
  - UnderReview → Approve / Request info
  - InfoRequested → Review response
  - Approved → **Prepare disbursement** (this is break #6, now a real button)
  - InRepayment → Record repayment
- **Loan summary** mini-KPIs (once a loan exists): outstanding, rate, term, next due.
- **Case actions**: assign to user, change status (via `allowedNextStatuses`), request info.

**Tabs** (right)
| Tab | Source (existing use case) |
|-----|----------------------------|
| Overview | `applications.getApplication` — client, business, reg no, purpose, dates, assignee |
| Documents | `documents.*` — **inline preview** (see §5) |
| **Money** | `loans.getLoan / disburseLoan / recordRepayment` — the merged loan surface |
| Tasks | `tasks.*` |
| Notes | `notes.*` |
| History | `applications.getHistory` (status timeline) |
| Advisory (NFS) | `nfs.*` — shown only when `tenantConfig.features.nonFinancialSupport` |

**Money tab (the merge)** — everything from today's `LoanDetailsPage`, now inside the case:
- If a loan exists: side-by-side **Disburse** and **Record repayment** forms (keep the separate `useFormErrors` instances so an error on one form doesn't bleed into the other — see current `LoanDetailsPage` rationale), plus the **repayment schedule** and **repayments** tables.
- If no loan yet: a **Prepare disbursement** panel (approved amount, first due date, "Create loan & disburse"). On disbursement the loan appears in the same tab.

### 4.4 Documents — inline preview

Split view inside the Documents tab:
- **Left:** required-document checklist (from `useDocumentRequirements` + `DOCUMENT_LABELS`), each with a status dot — green = Verified, amber = Uploaded, grey = Missing.
- **Right:** preview pane — file-type tag, name, uploader + date, status pill, the rendered document, and an action bar: **Download · Verify · Reject**.
- **Missing** item → upload prompt in place of the preview (checklist and uploader are the same surface).

**Implementation note:** today `documents.getDocumentUrl` returns a signed URL opened with `window.open` (new tab). Inline preview requires **embedding** that signed URL — PDFs in an `<iframe>`/`<embed>`, images in an `<img>` — rather than popping a tab. Verify/Reject reuse `documents.verifyDocument` / `rejectDocument`.

### 4.5 Loans (`/loans`) — NEW

- Table: Loan ID · Business (client) · Principal · Outstanding · Next due · Status (In Repayment / Arrears / Closed), with an arrears day-count flag.
- Row → `/case/:id?tab=money` (keeps one workspace; honours the merge).
- Backed by a loans list endpoint (portfolio summary already aggregates loans; a list view may need a thin `listLoans` addition).

### 4.6 Portfolio (`/portfolio`)

- **Health KPIs:** Total loans · Active · Outstanding principal · In arrears (PAR) — from `reports.getPortfolioSummary`.
- **Arrears table** (`reports.getArrears`): loan · client · instalment · due date · outstanding · days overdue — **rows link to the case Money tab** (fixes break #5). Keep the existing CSV export.

### 4.7 Reports (`/reports`) — see §7

### 4.8 User Access (`/user-access`)

Admin (and SuperAdmin) surface for managing who can do what. Restyles today's `pages/UserAccessPage.tsx` into the new system while preserving its exact permission model.

**KPI band:** Visible users · Internal · Clients · Admins (derived from the filtered list; today shows Visible/Admins only — Internal/Clients added).

**Filters:** search (name/email, `useDeferredValue`) + user-type chips (All · Internal · Clients · Admins) + role filter. State is URL-driven for shareable views. Maps to `listAdminUserAccess({ search, filter, role })` with existing `AdminAccessFilter` values (`all | internal | clients | admins | non-admins`).

**Role reference strip:** least → most access — `Client · Intern · Originator · LoanOfficer · Admin` — with the rules called out inline (× removes a role; Admin is SuperAdmin-managed; Reset MFA clears authenticators).

**User table** — one row per user (`AdminAccessListItem`: `userId`, `fullName`, `email`, `roles[]`, `isAdmin`):
- **Name / email** — display falls back email → userId (existing `displayName`).
- **Roles** — removable chips. The **×** shows only on roles the actor may manage (`canManageRole`): a normal Admin can remove Intern/Originator/LoanOfficer/Client, but the **Admin** chip's × appears **only for a SuperAdmin**.
- **Manage** — a role `<select>` (assignable roles only, filtered by `canManageRole`) + **Assign**, plus **Reset MFA** for internal users.

**Permission model (unchanged — `lib/rbac`):**
- `ELEVATED_ROLES = ['Admin']` → only a **SuperAdmin** may grant/revoke Admin.
- Other roles → Admin or SuperAdmin.
- `assignableRoles` = `ALL_ROLES.filter(canManageRole)` — drives both the assign dropdown and which chips are removable.
- **Reset MFA** (`resetUserMfa`) — **SuperAdmin only, never on self** (`user.userId !== session.user.id`). It is the only recovery path from an MFA lockout (Supabase has no self-service reset).

**Every sensitive action confirms first.** Assign, Remove, and Reset MFA each open a confirmation dialog showing user · email · current roles and the precise consequence. The **Reset MFA** dialog carries a red warning note ("lowers the account to password-only until they re-enrol — only do this once you're confident who you're speaking to"). Confirm calls the matching mutation (`assignUserRole` / `removeUserRole` / `resetUserMfa`), then invalidates `admin-user-access` and `me`, and toasts the outcome.

**New components:** removable role chip (`.rolechip` + `.chipx`), a reusable confirm dialog (`showConfirm(title, body, okLabel, danger, onConfirm)`) styled `.umodal` — this replaces the bespoke inline modal and is reused anywhere a destructive action needs a gate.

---

## 5. Visual design system

Refines the existing `styles/global.css`. Keep the current type stack (Anton display, Inter body, Geist caption, IBM Plex Mono data); the board used system fallbacks only because the Artifact CSP blocks font CDNs.

### 5.1 Colour tokens

Defined as CSS custom properties; redefined per theme (`@media (prefers-color-scheme)` + `:root[data-theme=…]`).

| Token | Light | Dark |
|-------|-------|------|
| `--ground` | `#f6f7fc` | `#0b0b0e` |
| `--panel` | `#ffffff` | `#15161d` |
| `--ink` | `#10121a` | `#f2f3f8` |
| `--ink-soft` | `#4a4f63` | `#b6bacb` |
| `--hair` | `#e2e5f1` | `#262838` |
| `--accent` | `#3f5bff` | `#6c86ff` |
| `--good` | `#128a4e` | `#4cc98a` |
| `--warn` | `#b06a00` | `#e6a94a` |
| `--crit` | `#c62a2a` | `#ff6b6b` |

Neutrals are biased slightly toward the accent blue (chosen, not defaulted). Semantic good/warn/crit are **separate** from the accent and are never reused as a chart series.

### 5.2 Chart palette (categorical) — validated

Used only where identity matters (gender split, spatial donut). Validated with the dataviz validator (CVD + contrast) in both modes:

| Slot | Light | Dark |
|------|-------|------|
| cat1 | `#3f5bff` | `#6c86ff` |
| cat2 | `#17a2b3` | `#0f9e91` |
| cat3 | `#e07b39` | `#cf7233` |
| cat4 | `#7c5cff` | `#7a5ce0` |

Rules: assign hues in fixed order (never cycle); single-series charts use one accent hue with direct labels; sequential/aging uses one hue light→dark or the status ramp with labels; **run `scripts/validate_palette.js` before changing these**.

### 5.3 Components

- **Status pill** — colour + label (`.p-review`, `.p-info`, `.p-approved`, `.p-repay`, `.p-draft`, closed/rejected variants).
- **SLA badge** — mono, `SLA {n}d`, amber at 4 days, red at ≥ 5.
- **Lifecycle rail** — beads + connectors; done / current / future states.
- **KPI tile** — hover lift + accent rail, right-arrow affordance = "this navigates".
- **Case drawer** — right slide-in with scrim, breadcrumb, lifecycle, linked-loan card, actions, `Open full case`.
- **Chart marks** — thin bars, 4px rounded data-ends on baseline, recessive grid, endpoint dot on lines, hover title/tooltip, legend for ≥ 2 series.

### 5.4 Both themes are designed

Every token is redefined for dark; charts re-step on the dark surface (not a naive invert). Respect `prefers-reduced-motion` (already present in `global.css`).

---

## 6. Cross-cutting patterns

- **Entity linking:** loan IDs, application IDs, client names render as links to their canonical screen, never plain text.
- **Breadcrumbs:** every deep screen shows `Dashboard › <section> › <entity>` and the back control returns to the origin (dashboard vs pipeline vs loans vs portfolio).
- **Drawer vs page:** triage in the drawer; deep work on the full page. The drawer never dead-ends — it always offers the full case.
- **Role gating:** unchanged RBAC (`hasAnyRole`, `RequireRole`); the merged Case route requires Originator+ , Money actions require LoanOfficer/Admin.

---

## 7. Reports (rebuilt)

Carries the full live report set from `pages/ReportsPage.tsx` + `logic/usecases/reports`, organised so more reports are browsable.

- **Category chips:** All · Performance · Portfolio & Risk · Compliance · Activity (filters the card grid).
- **Time range:** 30 / 90 / All (existing `getDateRange`).
- **Top KPI band:** avg turnaround · approval rate · disbursed (period) · outstanding.

| Category | Reports (existing use case) |
|----------|-----------------------------|
| Performance | Pipeline Status Summary (`getPipelineSummary`, bar) · Origination Volume Trend (`getOriginationTrends`, line) · Pipeline Conversion (`getPipelineConversion`) · Turnaround (`getTurnaround`) |
| Portfolio & Risk | Debtors Book Age Analysis (`getDebtorsAgeAnalysis`, severity-coloured) · Portfolio-at-Risk % (`getPortfolioSummary`/`getArrears`) · **Collections vs Due** (proposed) |
| Compliance (NCR/SEDFA) | Demographic Breakdown (`getDemographicBreakdown`) · Province Breakdown (`getProvinceBreakdown`) · Spatial Classification (donut) |
| Activity | Staff Productivity (`getProductivity`) · Audit Log (`getAuditLog`) |
| Export Center | CSV downloads for all of the above (existing `handleExportCsv`) |

**Proposed additions** (post-parity): Collections performance (expected vs actual over time) · Cohort/vintage analysis (arrears by loan age) · Officer scorecard (productivity + quality) · Concentration risk (exposure by sector/province/size band).

---

## 8. Decisions made

- ✅ **Merge** Application + Loan into one Case workspace (not just cross-link).
- ✅ **Both** drill targets: KPI → full filtered list; row → drawer with **Open full case** CTA.
- ✅ Documents: split **list + inline preview**, with verify / download / reject under the preview.
- ✅ Reports: incorporate all live reports first, then extend.

## 9. Open questions

1. Reports — build the four proposed reports now, or after parity?
2. Preview fidelity — is embedded PDF/image enough, or add zoom / multi-page paging?
3. Loans — closed/serviced loans always open the Case (Money tab), or is a read-only loan cockpit wanted for closed loans?

---

## 10. Build order (suggested)

> Expanded into a full ticket backlog (epics, dependencies, file touchpoints, acceptance criteria) in [`flow-redesign-tickets.md`](./flow-redesign-tickets.md).

1. **Plumbing:** breadcrumbs in the shell; fix the `/loans` nav entry; make `KPIStatCard` and queue rows link.
2. **Pipeline** (`/pipeline`) with URL-driven filters; point KPI blocks at it.
3. **Case workspace** (`/case/:id`): move Applications detail in, add the lifecycle rail and left-rail actions.
4. **Money tab:** fold `LoanDetailsPage` in; redirect `/loan/:loanId`.
5. **Documents inline preview:** embed signed URLs; wire verify/reject.
6. **Loans** (`/loans`) + **Portfolio** arrears links.
7. **Reports** rebuild (categories, KPI band, existing charts via Recharts, export center).
8. **User Access** restyle.
