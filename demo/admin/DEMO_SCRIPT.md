# PRDF Admin Console — Demo Script & Storyboard

A ~2.5–3 minute walkthrough of the **PRDF staff-facing admin console**: the
role-aware workspace where loan officers and administrators triage applications,
review documents, move cases through the pipeline, monitor the portfolio, read
analytics, and manage user access.

**Persona:** *Naledi Khumalo*, a PRDF administrator, working her assigned queue
of incoming loan applications.

**Assets in this folder**
- `video/prdf-admin-walkthrough.webm` — screen recording of the full journey
- `screenshots/00…09` — retina stills for each scene (use in slides/thumbnails)

**Demo account:** `admin@prdf.co.za` / `DemoAdmin1!` (a confirmed Supabase user
with the **Admin** role, so every page — including Admin-only User Access — is
visible). Admin console runs on `http://localhost:5175`.

---

## Voiceover script (with on-screen actions)

### Scene 1 — Sign in & dashboard  ·  `01-dashboard`
**Action:** Sign in. Land on the Admin Dashboard.

> "Staff sign in to the PRDF admin console — a role-aware workspace. Naledi lands
> on her dashboard: a snapshot of the pipeline, how many cases are under review,
> tasks that are overdue, and — flagged in amber — any applications that have
> breached their SLA. Below sits her assigned queue, newest first."

### Scene 2 — Applications workspace  ·  `02-applications`
**Action:** Open *Applications*. Show the searchable, filterable list with the
tabbed detail workspace beside it.

> "The heart of the console is the applications workspace — a responsive list on
> one side, a tabbed case file on the other. Naledi can search by ID or purpose,
> and filter by status to focus on exactly the cases she needs."

### Scene 3 — Filter the pipeline  ·  (video only)
**Action:** Change the status filter to *Submitted*, then back to *All statuses*.

> "Filtering to 'Submitted' surfaces brand-new applications waiting for a first
> review — the top of the funnel."

### Scene 4 — Open a case · Details  ·  `06-app-detail-details`
**Action:** Click *Review* on a case. The detail workspace loads on the *Details*
tab — business profile, loan details, and the applicant's demographics.

> "Opening a case gives Naledi the full picture: the business profile,
> registration and compliance details, the requested amount and term, and the
> developmental‑impact demographics PRDF reports on."

### Scene 5 — Documents & verification  ·  `07-app-detail-documents`
**Action:** Click the *Documents* tab. Show the document checklist with each
uploaded file and its **View / Download · Verify · Reject** controls.

> "The Documents tab is a verification checklist. Every file the applicant
> submitted — ID, proof of address, CIPC registration, tax clearance, three
> months of bank statements, and financials — is here to open, verify, or reject,
> one by one."

### Scene 6 — Audit history  ·  `08-app-detail-history`
**Action:** Click the *History* tab. Show the status timeline.

> "The History tab is a full audit trail — every status change, who made it, and
> when. Nothing happens to an application off the record."

### Scene 7 — Move the case forward  ·  `09-app-status-updated`
**Action:** On *Details*, set *Change status* to *Under Review* and click
*Update Status*. The badge flips to *Under Review* and the new transition appears
in History.

> "When Naledi's ready to act, she moves the case along — here, from Submitted to
> Under Review. She can also assign it to a colleague or request more information
> from the applicant. The status updates instantly, and the change is logged."

### Scene 8 — Portfolio  ·  `03-portfolio`
**Action:** Open *Portfolio*.

> "Once loans are disbursed, the Portfolio dashboard tracks health and exposure —
> total and active loans, outstanding balance, and any overdue installments in
> arrears — with a one-click CSV export."

### Scene 9 — Reports & analytics  ·  `04-reports`
**Action:** Open *Reports*. Slowly scroll through the charts and tables: pipeline
status, origination trend, conversion, demographic and provincial breakdowns,
debtors ageing, and the Export Center.

> "The Reports workspace turns the loan book into insight: pipeline status and
> conversion, origination volume over time, staff productivity, and the
> demographic, provincial and spatial breakdowns PRDF reports on as a
> developmental funder — plus a debtors' age analysis. Every dataset can be
> exported from the Export Center for board and regulatory reporting."

### Scene 10 — User access & RBAC  ·  `05-user-access`
**Action:** Open *User Access*. Filter by the *Admin* role; show the assign
controls.

> "Finally — because this is Naledi's console as an administrator — User Access.
> Here admins grant and revoke internal roles: Intern, Originator, Loan Officer,
> Admin. Access is least-privilege and role-aware, and only a Super Admin can
> manage other admins. That's the PRDF admin console — from a new application to a
> funded, reported-on loan."

---

## Shot list (quick reference)

| # | Screenshot | Scene | Suggested on-screen action |
|---|------------|-------|----------------------------|
| 1 | `01-dashboard` | Dashboard / queue | Sign in |
| 2 | `02-applications` | Applications workspace | Open Applications |
| 3 | — (video) | Filter pipeline | Status filter → Submitted → All |
| 4 | `06-app-detail-details` | Case · Details tab | Click *Review* on a case |
| 5 | `07-app-detail-documents` | Case · Documents tab | Click Documents |
| 6 | `08-app-detail-history` | Case · History tab | Click History |
| 7 | `09-app-status-updated` | Change status | Submitted → Under Review, Update |
| 8 | `03-portfolio` | Portfolio | Open Portfolio |
| 9 | `04-reports` | Reports & analytics | Scroll through charts/tables |
| 10 | `05-user-access` | User Access / RBAC | Filter by Admin role |

---

## Notes & caveats for whoever records the final cut

- **Two dev servers run side by side:** client-ui on `:5174`, admin console on
  `:5175` (started with `yarn dev --port 5175` from `admin-ui/`). They share the
  same Supabase project.
- **The status change in Scene 7 is a real mutation.** The demo moves application
  `2ea702c6` from *Submitted* to *Under Review*; the History tab and dashboard
  reflect it. Re-run against a *Submitted* case, or reset the status, before a
  second take.
- **Some Reports panels show "No data"** (origination trend, conversion, staff
  productivity, audit log) because the demo project has little historical data.
  Pipeline status, demographic/provincial/spatial breakdowns, and the Export
  Center are populated. Seed more applications/loans over time to fill the
  time-series charts.
- **Portfolio shows an empty state** — no loan is disbursed, and the `loans`
  table's row-level security blocks reads over the API even for staff, so a
  disbursed loan won't appear without an RLS policy that grants staff SELECT on
  `loans`.
- **User Access lists real user emails** from the project. If this recording is
  for an external audience, blur that panel or seed placeholder users first.
- **Video format:** `.webm` (VP8) — plays in any modern browser, Slack, and
  Google Drive. For `.mp4`, re-encode with a full ffmpeg:
  `ffmpeg -i prdf-admin-walkthrough.webm -c:v libx264 -pix_fmt yuv420p prdf-admin-walkthrough.mp4`.
- Screenshots are captured at 2× (retina), 1440×900 viewport, full-page.
