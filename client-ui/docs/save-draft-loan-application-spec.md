# Implementation Spec — Save & Resume a Loan Application Draft (Client UI)

**Status:** Decisions locked — ready to build (see §15)
**Owner:** Client-UI
**Related:** `client-ui/src/pages/ApplyPage.tsx`, `src/logic/usecases/applications`,
`src/lib/data/adapters/supabase/applications.supabase.ts`, `infra/supabase/*`

---

## 1. Summary

Let a client **save a partially-completed loan application as a draft, leave, and
later return to complete and submit it** — with all previously-entered data
(business profile, financials, loan details, and uploaded documents) restored.

Today the 5-step apply wizard keeps everything in memory and only writes to the
database at final submit. If the user navigates away, all progress is lost. This
spec adds durable, resumable drafts.

## 2. Goals & non-goals

**Goals**
- A "Save & finish later" action available on every wizard step.
- Automatic save when advancing between steps (so progress is never silently lost).
- A clear way to resume: from the Status page, the Home page, and by returning to
  `/apply`.
- Full restoration of steps 1–3 (business profile, financials, loan details),
  the wizard position, and step 4 documents already uploaded.
- One draft per in-progress application; a client may have multiple drafts over time.

**Non-goals**
- Draft editing in the **admin** console (staff already have status controls).
- Offline/local-only drafts (we persist server-side; see §6 for a local fallback).
- Versioning / draft history.

## 3. User stories & acceptance criteria

1. *As a client, I can click "Save & finish later" on any step and be told my
   progress is saved.*
   - AC: A `loan_applications` row with `status = 'Draft'` exists for my client,
     holding all data entered so far. A toast/confirmation appears. I can safely
     close the tab.
2. *As a client, when I come back I can resume exactly where I left off.*
   - AC: From Status/Home I see my draft with a **Resume** action. Clicking it
     opens `/apply` with every field, the current step, and any uploaded documents
     restored.
3. *As a client, advancing a step saves my progress automatically.*
   - AC: After clicking "Continue" on any step, the draft is updated server-side
     without an explicit save.
4. *As a client, I can submit a resumed draft normally.*
   - AC: Submitting a resumed draft runs the same consent + submit flow and
     transitions the row `Draft → Submitted` (no duplicate application is created).
5. *As a client with only a draft (never submitted), I can still reach the page
   that lets me resume.*
   - AC: The client-progress guard no longer traps draft-only users away from the
     resume entry point.

## 4. Current behaviour (grounded analysis)

| Area | Today | Implication for drafts |
|------|-------|------------------------|
| Wizard state | `ApplyPage.tsx` holds all steps in a `useReducer` (`WizardState`), seeded blank each mount. | Nothing is persisted until submit; refresh loses everything. |
| Draft creation | `handleFinalSubmit` calls `applicationsUseCases.createDraft(...)` **then immediately** `submitApplication(...)`. The `loan_applications` row is created only at submit. | Need to create/persist the row *early* and keep its id. |
| Step 1 (business/compliance) | Persisted to the **`clients`** table via `resolveClientId` → client insert (`applications.supabase.ts`). | On resume we must read these back; `resolveClientId` currently **reuses an existing client without updating fields**, so edits aren't saved. |
| Step 2 (financials: `monthlyRevenue`, `yearsInOperation`, `numberOfEmployees`, `bankName`) | **Not persisted anywhere.** Not in `clients`, not in `loan_applications`, not in `CreateApplicationInput`. | Requires a schema + payload change to save/restore. **Primary gap.** |
| Step 3 (loan details) | Stored on `loan_applications` (`requested_amount`, `term_months`, `purpose`). | Already persisted; reusable. |
| Step 4 (documents) | `File` objects held in memory; uploaded only at submit via `documentsUseCases.uploadDocumentFlow`. | `File`s can't be serialized; drafts must upload-on-add or re-collect on resume. |
| `updateDraft` / `UpdateApplicationInput` | Only `requestedAmount`, `termMonths`, `purpose`, `assignedToUserId`. | Too narrow — can't update business profile or financials. |
| Read model | `getApplication` → `ApplicationDetails` returns only `loan_applications` columns (+ `loanId`). | Can't rehydrate the wizard; must join client profile + financials + docs + step. |
| Progress guard | `RequireClientProgress` redirects to `/apply` unless a **submitted** app exists (`submittedStatuses` excludes `Draft`). `/apply` always starts blank. | Draft-only users can't reach `/status`; `/apply` ignores existing drafts. |
| Status page | `StatusPage.tsx` renders a read-only draft card ("This application is still in draft…") — **no resume action**. | Add a Resume CTA. |

## 5. Design overview

Four building blocks:

1. **Persist the draft early and keep its id.** Create the `loan_applications`
   draft row on the first save (explicit "Save & finish later", or on the first
   "Continue" out of Step 1). Store the returned `id` in wizard state **and the
   URL** (`/apply?draft=<id>`) so a refresh reloads the same draft.
2. **Widen what a draft stores.** Add columns for step-2 financials and the wizard
   position, and make `updateDraft` write step 1 (client), step 2 + 3
   (application), and `current_step`.
3. **Restore on resume.** Extend the read model so `getApplication` returns the
   full profile (client + financials + loan details + `current_step` + documents);
   hydrate the reducer from it.
4. **Surface resume entry points** and relax the progress guard.

### Key decisions (locked)

- **When to create the draft:** on the first "Continue" from Step 1 *or* an
  explicit "Save & finish later", whichever comes first. Rationale: Step 1 holds
  the minimum meaningful data and the `clients` row; creating earlier risks empty
  junk drafts.
- **Storage model — HYBRID.** Discrete nullable columns on `loan_applications`
  are the **source of truth** (financials + loan details, useful for reporting and
  authoritative at submit); a `draft_state jsonb` column stores the **exact UI
  state** for pixel-perfect restoration (current step, partially-filled or
  not-yet-valid fields). On submit, the normalized columns win and `draft_state`
  is cleared. (§6/§11)
- **One active draft per client.** Enforced by a partial unique index on
  `loan_applications (client_id) WHERE status = 'Draft'`. `saveDraft` therefore
  **upserts** the client's single open draft rather than creating new rows.
- **Documents in drafts — DEFER for Phase 1 (Option B).** Do not persist Step-4
  files in the draft; restore steps 1–3 + position on resume and re-collect files
  before submit. Upload-on-add (Option A) lands in Phase 2 once client RLS/Storage
  policies for own-draft documents are in place. Rationale: documents are the last
  step and upload-on-add is the riskiest slice; deferring ships resume fast and
  correct. (§10)
- **30-day retention.** Drafts whose `last_saved_at` is older than 30 days are
  auto-purged by a scheduled job (§6).
- **Save UX:** explicit "Save & finish later" button on every step **plus**
  autosave on each "Continue". Debounced field-level autosave is a nice-to-have,
  not required.

## 6. Data model & migration

New migration `infra/supabase/phase9_draft_applications.sql` (idempotent, following
the `phase8_5_consent.sql` pattern):

```sql
-- Step-2 financials + wizard position + exact UI state for resumable drafts.
alter table public.loan_applications
  add column if not exists monthly_revenue     numeric,
  add column if not exists years_in_operation  integer,
  add column if not exists number_of_employees integer,
  add column if not exists bank_name           text,
  add column if not exists current_step        smallint not null default 1,
  add column if not exists last_saved_at        timestamptz,
  -- HYBRID: exact-UI restoration (partially-filled / not-yet-valid fields).
  -- Normalized columns above remain the source of truth; cleared on submit.
  add column if not exists draft_state         jsonb;

-- One active draft per client.
create unique index if not exists uniq_active_draft_per_client
  on public.loan_applications (client_id)
  where status = 'Draft';

-- 30-day retention: purge stale drafts. Runs daily via pg_cron.
create or replace function public.purge_stale_drafts() returns void
language sql security definer as $$
  delete from public.loan_applications
  where status = 'Draft'
    and coalesce(last_saved_at, created_at) < now() - interval '30 days';
$$;

-- Requires the pg_cron extension (enable in Supabase → Database → Extensions):
-- select cron.schedule('purge-stale-drafts', '0 3 * * *', $$select public.purge_stale_drafts()$$);

NOTIFY pgrst, 'reload schema';
```

Notes
- All new columns are nullable / defaulted, so existing rows and the current
  submit flow are unaffected.
- `current_step` lets us reopen the wizard on the right step; `draft_state` carries
  exact UI restoration (hybrid model).
- The partial unique index enforces **one active draft per client**; `saveDraft`
  must upsert the existing draft (see §7.3). Deleting/submitting the draft frees
  the slot.
- Retention: `purge_stale_drafts()` deletes drafts idle > 30 days; document/consent
  child rows cascade. If `pg_cron` isn't available, run it from a scheduled Edge
  Function or an existing cron runner instead.
- RLS: `loan_applications` already lets a client insert/select/update their own
  rows (drafts included) — verify the existing update policy permits a client to
  `UPDATE` their own `Draft` row (see §9).

## 7. Backend / data-layer changes

### 7.1 Types (`src/lib/api.ts`)
- Extend `CreateApplicationInput` **and** add a dedicated `UpdateDraftInput`
  (or widen `UpdateApplicationInput`) with the step-2 fields + `currentStep`:
  ```ts
  monthlyRevenue?: number
  yearsInOperation?: number
  numberOfEmployees?: number
  bankName?: string
  currentStep?: number
  ```
- Extend the read model. Add `ApplicationDraftDetails` (or widen
  `ApplicationDetails`) to include the joined client business/compliance profile,
  the financials, `currentStep`, and `documents: ApplicationDocument[]`.

### 7.2 Supabase adapter (`applications.supabase.ts`)
- **`resolveClientId`** → make it upsert: when the client row exists, `UPDATE`
  the step-1 fields (so business-profile edits persist), don't just reuse the id.
- **`createDraft`** → also write the new financial columns + `current_step`.
- **`updateDraftInternal`** → widen to update: client step-1 fields, application
  step-2 financials, step-3 loan details, and `current_step` / `last_saved_at`.
  Keep it usable by the existing `updateDraft`/`assignApplication` callers.
- **`getById`** → join `clients` and select the new columns + call
  `documents` (or have the caller fetch docs) so the wizard can rehydrate.
- No change to `changeStatusInternal` / `submit` — resumed drafts submit through
  the same `Draft → Submitted` transition, so **no duplicate row** is created.

### 7.3 Use cases (`src/logic/usecases/applications/index.ts`)
- Add `saveDraft(id | null, input)` convenience — the single entry point the
  wizard calls for both explicit save and autosave. Behaviour honours **one active
  draft per client**: when `id` is null, look up the client's existing open draft
  and update it; only create if none exists (relying on the partial unique index
  as the backstop). Returns the draft id.
- Add `getMyDraft()` — returns the client's current open draft summary (or null),
  used by the resume entry points (§8.4).
- Keep `getApplication`, `submitApplication` as-is.

## 8. Frontend changes (`ApplyPage.tsx` + entry points)

### 8.1 Wizard rehydration
- Read `?draft=<id>` on mount. If present, `getApplication(id)` and dispatch a new
  `HYDRATE` reducer action that fills `step1/step2/step3`, sets `currentStep`, and
  seeds already-uploaded documents (as references, not `File`s).
- If absent, start blank as today.

### 8.2 Save actions
- Add a **"Save & finish later"** button in the wizard footer on every step
  (next to Back/Continue). It:
  1. validates only what's needed to persist (allow saving an incomplete step —
     validation for *submit* stays strict),
  2. calls `saveDraft(currentDraftId, currentData)`,
  3. writes `?draft=<id>` into the URL if newly created,
  4. shows a confirmation toast, and optionally routes to `/status`.
- On each **"Continue"**, call `saveDraft(...)` (autosave) before advancing.
- Track `currentDraftId` in wizard state; include `currentStep` in every save.

### 8.3 Reducer
- Add `HYDRATE` (payload: full draft detail) and a `SET_DRAFT_ID` action.
- `SET_STEP2` already exists; ensure step-2 data flows into `saveDraft`.

### 8.4 Resume entry points — "Resume your draft"
Whenever an authenticated client has **any** draft application, surface a
**"Resume your draft"** button that routes to `/apply?draft=<id>` (using
`getMyDraft()` — there is at most one open draft per §5):
- **StatusPage** (`status-app-card` Draft branch, ~line 135): primary Resume button.
- **HomePage**: a "Resume your draft" prompt/banner when an open draft exists.
- A shared `<ResumeDraftButton />` (queries `getMyDraft`, renders nothing when
  there's no draft) so the same control can be dropped into either page and the
  app shell.
- Net-new "New Application" CTAs continue to `/apply` (blank); if a draft already
  exists, `/apply` resumes it rather than starting a second one (§13).

### 8.5 Progress guard (`RequireClientProgress.tsx`)
- Current logic redirects to `/apply` unless a *submitted* app exists, which traps
  draft-only clients away from `/status`.
- Change to: allow `/status` when the client has **any** application (draft
  included) so drafts are visible/resumable; keep sending brand-new clients (zero
  applications) to `/apply`. `/home` may still gate on a submitted app or show the
  resume prompt.

## 9. Security / RLS

- **`loan_applications`:** confirm the client `UPDATE` policy allows a client to
  update their **own** `Draft` row (join `clients.user_id = auth.uid()`), and only
  while `status = 'Draft'` (prevent editing after submission). Add/adjust a policy
  if needed in the phase-9 migration.
- **`loan_documents` + Storage (only if upload-on-add, §10):** clients must be
  able to `INSERT`/`SELECT` and download their own draft's documents. Verify the
  `loan_documents` policies and the Storage bucket policy scope to
  `application → client → auth.uid()`. This mirrors the consent-table policy shape
  in `phase8_5_consent.sql`.
- Consent is still captured **at submit only** (unchanged) — a draft has no
  consent record until it is submitted.

## 10. Document handling — two options

> **Decision:** Phase 1 ships **Option B (defer)**; Option A (upload-on-add) is the
> Phase 2 target.

**Option A — Upload-on-add (Phase 2 target).**
- When a file is chosen in Step 4, immediately `uploadDocumentFlow(draftId, type,
  file)` so it persists as a `loan_documents` row.
- On resume, `getDocuments(draftId)` lists them; render existing docs with
  remove/replace; only submit-time validation requires the full set.
- Needs the RLS/Storage work in §9 and a small `FileDropzone` change to show
  "already uploaded" state.

**Option B — Defer (Phase-1 fallback).**
- Don't persist Step 4 in drafts. On resume, restore steps 1–3 and the position,
  but the user re-selects documents before submitting.
- Zero Storage/RLS work; ship faster. Acceptable because documents are the final
  step. Recommended if we want to release resume for steps 1–3 first.

## 11. Storage model — HYBRID (selected)

We combine both approaches:
- **Discrete normalized columns** (§6) are the **source of truth** — financials +
  loan details, authoritative at submit and usable for reporting.
- **`draft_state jsonb`** carries the **exact UI state** (current step,
  partially-filled and not-yet-valid fields) for pixel-perfect restoration.

Rules:
- On every save, write both: mapped fields to normalized columns, full form
  snapshot to `draft_state`.
- On resume, hydrate the wizard from `draft_state` when present (falling back to
  normalized columns).
- On **submit**, normalized columns win and `draft_state` is set to `NULL`.
- Accept that `draft_state` duplicates PII while a draft is open; it is cleared at
  submit and purged with the draft at 30 days (§6).

## 12. Phased implementation plan

**Phase 1 — Resumable steps 1–3 (core value)**
1. Migration §6: financials + `current_step` + `last_saved_at` + `draft_state`
   jsonb (hybrid), the partial unique index (one active draft), and
   `purge_stale_drafts()` + daily cron (30-day retention).
2. Types + adapter: widen create/update (hybrid write), **upsert** the client's
   single open draft, fix `resolveClientId` to update fields, extend read model,
   add `getMyDraft()`.
3. `saveDraft` + `getMyDraft` use cases.
4. ApplyPage: `currentDraftId`, autosave on Continue, "Save & finish later",
   `?draft=` handling, `HYDRATE` from `draft_state`.
5. Shared `<ResumeDraftButton />`; wire into Status + Home; `RequireClientProgress`
   change so draft-only clients can reach `/status`.
6. Documents via **Option B** (defer / re-collect on resume).

**Phase 2 — Persisted documents (full fidelity)**
7. RLS/Storage for own draft docs (§9).
8. Upload-on-add + resume rendering (Option A).

**Phase 3 — Polish**
9. Debounced field-level autosave + "Saved ✓ / Saving…" indicator.
10. "Discard draft" (delete) action; empty-draft cleanup.

## 13. Edge cases

- **Multiple drafts:** resume targets an explicit `?draft=<id>`; entry points pass
  the specific id. "New Application" always creates a fresh draft.
- **Concurrent edits / stale tab:** last-write-wins on `updateDraft`; optionally
  compare `last_saved_at` and warn. Low priority for a single-user client.
- **Loan amount/term from calculator:** Step 3 seeds from `CalculatorContext`; on
  resume, the saved values take precedence over calculator defaults.
- **Submit of a resumed draft:** must `UPDATE` the existing row, not `createDraft`
  again — route submit through the tracked `currentDraftId`.
- **Draft deleted server-side:** if `getApplication(?draft)` 404s, fall back to a
  blank wizard and clear the query param.
- **Business-profile edits by returning client:** requires the `resolveClientId`
  upsert fix, else edits silently don't persist.
- **RLS blocks update after submit:** guard the UI so a non-Draft app can't be
  reopened for editing.

## 14. Testing

- **Unit:** reducer `HYDRATE`/`SET_DRAFT_ID`; `saveDraft` create-vs-update
  branching; adapter field mapping (esp. new financial columns + client upsert).
- **Integration (Supabase):** create draft → update each step → reload
  `getApplication` returns everything → submit transitions `Draft → Submitted`
  with no duplicate row; RLS: client can update own draft but not others'.
- **E2E (Playwright, mirrors `demo/scripts`):** fill steps 1–3 → Save & finish
  later → assert draft row + toast → return via Status "Resume" → assert fields +
  step restored → complete step 4 + consent → submit → lands on `/status`.
- **Regression:** the straight-through (no-save) submit path still works.

## 15. Resolved decisions

1. **Storage model:** HYBRID — discrete normalized columns as source of truth +
   `draft_state jsonb` for exact UI restoration (§6/§11).
2. **Documents:** Phase 1 **defers** (Option B); upload-on-add is Phase 2 (§10).
3. **Resume entry point:** a **"Resume your draft"** button shown whenever an
   authenticated client has any open draft, on both Status and Home via a shared
   component; `RequireClientProgress` relaxed so draft-only clients can reach it
   (§8.4, §8.5).
4. **Retention:** drafts idle > **30 days** are auto-purged (§6).
5. **Cardinality:** **one active draft per client**, enforced by a partial unique
   index; `saveDraft` upserts (§5, §6, §7.3).

### Remaining follow-ups (non-blocking)
- Confirm `pg_cron` availability in the Supabase project (else use a scheduled Edge
  Function for `purge_stale_drafts()`).
- Confirm the existing `loan_applications` client `UPDATE` RLS policy allows
  updating own `Draft` rows and blocks editing after submit (§9).
```
