# Implementation Spec — PRDF Product Rules, Draft Saving, and Document Checklist Fixes

**Status:** Ready for implementation  
**Owner:** Client-UI / Data Layer  
**Related:** `client-ui/src/pages/ApplyPage.tsx`, `client-ui/src/pages/EligibilityCheckPage.tsx`, `client-ui/src/lib/loanLimits.ts`, `client-ui/src/lib/loanCalc.ts`, `client-ui/src/lib/format.ts`, `client-ui/src/lib/requirements.ts`, `client-ui/src/logic/usecases/applications`, `client-ui/src/logic/usecases/documents`, `infra/supabase/phase9_draft_applications.sql`, `infra/supabase/phase10_draft_documents.sql`

---

## 1. Summary

Fix the client loan-application flow so it reflects PRDF's current product rules and reliably preserves applicant progress.

The required changes are:

- Currency must be South African Rand everywhere, displayed with the `R` symbol.
- Loan amounts must be limited to **R250 000 minimum** and **R5 million maximum**.
- Applicants must be able to save work in progress and resume later.
- Lending rate language must be **Prime+, up to P+10 based on the quality of the transaction**.
- Uploaded/downloaded documents must be saved as system records and reflected in the final document checklist.
- Eligibility criteria must match the approved PRDF criteria listed in this spec.

## 2. Goals

- Align all public/client-facing amount formatting, calculator values, loan sliders, validation, and review screens to ZAR and PRDF loan limits.
- Replace any flat-fee or non-Prime rate wording in the client experience with Prime+ wording.
- Make draft persistence reliable for application fields and uploaded documents.
- Ensure the final review checklist reads persisted uploaded documents, not only in-memory files.
- Make eligibility self-assessment criteria exact and auditable.

## 3. Non-Goals

- Implement credit scoring or automated pricing for Prime+ spreads.
- Build a full underwriting rules engine.
- Change admin approval authority or final loan-offer generation.
- Replace Supabase storage or the existing `loan_documents` table.

## 4. Current State

| Area | Current behaviour | Required correction |
|------|-------------------|---------------------|
| Currency | `formatRand` and `formatCurrency` already use ZAR in some places, but every amount display must be checked. | All monetary values show `R`, use `en-ZA` grouping, and avoid `$`, USD, or generic currency text. |
| Loan limits | **Done.** `client-ui/src/lib/loanLimits.ts` sets min `250000` / max `5000000`; enforced in both backends (`LoanLimits.cs`, `common/loan-limits.ts`) and the database (`phase12_loan_limits.sql`). | Set min to `250000`, max to `5000000`, and update all UI copy/tests. |
| Calculator/rate | `loanCalc.ts` currently uses a flat-fee model: 3% origination + 2% monthly service fee. | Replace user-facing lending-rate language with Prime+, up to P+10. Any calculated instalment must be labelled as indicative until Prime and spread are confirmed. |
| Draft saving | Draft persistence exists or is in progress, with `phase9_draft_applications.sql` and save-draft code paths. | Verify all wizard steps can save and resume without losing data. |
| Draft documents | `phase10_draft_documents.sql` and `documents.supabase.ts` support client draft document management. | Uploaded files must create storage objects and `loan_documents` rows immediately, then reload into the wizard checklist. |
| Review checklist | Step 5 must depend on persisted `loan_documents` records for the application draft. | The checklist must mark uploaded documents as uploaded after refresh/resume and at final review. |
| Eligibility | `EligibilityCheckPage.tsx` has a grouped checklist, but wording differs from the approved list. | Replace criteria with the exact approved wording below. |

## 5. Business Rules

### 5.1 Currency

- Currency code: `ZAR`
- Display symbol: `R`
- Examples:
  - `R250 000`
  - `R5 000 000`
  - `R1 250 000`
- Do not display USD, `$`, `ZAR 250000`, or unformatted raw numeric amounts in user-facing loan contexts.

### 5.2 Loan Limits

- Minimum loan amount: `250000`
- Maximum loan amount: `5000000`
- Preferred display text: **Loans from R250 000 to R5m**
- Slider/input step may remain `50000` unless product owners request finer increments.
- Validation must reject values below R250 000 or above R5 million before draft submit and final submit.
- Enforcement layers (all live): client wizard validation (`validation.ts`),
  C# API validators (`LoanApplicationRequestValidators.cs`), Node API service
  (`applications.service.ts`), and database range constraints
  (`infra/supabase/phase12_loan_limits.sql` — drafts exempt, checked on submit).

### 5.3 Lending Rate

- Public/client-facing wording:
  - **Lending rate: Prime+, up to P+10 based on the quality of the transaction.**
- Do not promise a fixed rate in the calculator.
- If an instalment estimate is shown before underwriting, label it as indicative and explain that the final rate depends on Prime and transaction quality.
- Persisted loan/application data should be ready for a future `primeSpreadBps` or `interestRate` value, but this spec does not require automated pricing.

## 6. Eligibility Criteria

The eligibility page must show the following criteria exactly, grouped only for readability:

1. Applicants who demonstrate expected Developmental Impact
2. Projects must demonstrate targets for employment creation
3. Enterprises must be >50.1% black women owned
4. Applicants must be 90% South African nationals with operations controlled by SA citizens
5. Enterprises must be 100% Director Operational
6. Applicants must be willing to participate in developmental programs
7. Transactions from rural provinces must have rural community participation
8. Projects must demonstrate sustainability
9. Applicants must be permanent residents of South Africa
10. The Enterprise(s) must be compliant with generally accepted corporate governance practices appropriate to the client's legal status
11. The business must demonstrate capacity to repay the loan offered
12. The business must be registered with the CIPC
13. The business must be registered with SARS as a taxpayer and in possession of a valid tax clearance certificate or a tax pin
14. The members/shareholders of the business must not be unrehabilitated insolvents and not be under debt review or an administration order

Eligibility behaviour:

- All criteria must be confirmed before the applicant can proceed to the loan application.
- The rural community participation criterion should be shown as a required confirmation when the applicant selects a rural province or indicates the transaction is rural. Until that province question exists, keep the criterion visible in the checklist.
- The eligibility result page must state that the self-assessment is preliminary and final approval remains subject to document verification, affordability, governance, and PRDF assessment.

## 7. Functional Requirements

### 7.1 Currency and Limits

- Update `client-ui/src/lib/loanLimits.ts`:
  - `LOAN_AMOUNT_MIN = 250000`
  - `LOAN_AMOUNT_MAX = 5000000`
- Update any default calculator amount to fall within the new range.
- Update all copy that refers to previous ranges.
- Audit these pages/components:
  - Landing page calculator
  - Apply wizard loan details step
  - Wizard cost card
  - Review step
  - Home/status/loan detail amount summaries
  - Login/register marketing loan preview

### 7.2 Draft Save and Resume

- The wizard must support explicit "Save & finish later" on every step.
- Moving between steps must autosave the current valid draft state.
- A saved draft must restore:
  - business/profile fields
  - financial fields
  - loan details
  - current wizard step
  - persisted uploaded documents
- Resuming a draft must update the same `loan_applications` row, not create a duplicate.
- Submitting a resumed draft must transition the existing row from `Draft` to `Submitted`.

### 7.3 Document Upload and Checklist

- When a user uploads a document during a draft:
  - upload the file to the configured Supabase storage bucket,
  - insert a corresponding `loan_documents` row,
  - update the local document list from the persisted row returned by the repository.
- The step-4 document checklist and step-5 final review must use `documentsUseCases.getDocuments(applicationId)` or equivalent persisted application documents.
- A browser refresh or logout/login after upload must still show the document as uploaded.
- Downloading or viewing a document must not be treated as proof of upload. The source of truth is the `loan_documents` row tied to the current application.
- If upload to storage succeeds but row insert fails, show an error and prevent the checklist from marking the document as uploaded.
- If row insert succeeds but local state update fails, refetch documents before rendering the checklist.

### 7.4 Lending Rate Copy

- Replace flat-fee descriptions in user-facing UI with Prime+ wording.
- Keep calculation utilities only if they are explicitly presented as indicative estimates.
- Add a code comment or constant naming that prevents the Prime+ copy from being mistaken for final pricing logic.

## 8. Data and Migration Requirements

- Confirm `phase9_draft_applications.sql` is applied in target environments for draft fields.
- Confirm `phase10_draft_documents.sql` is applied so clients can manage documents on their own draft applications.
- Verify RLS policies allow a client to:
  - select their own draft application,
  - update their own draft application,
  - insert/select/delete their own draft `loan_documents`,
  - upload/read/delete storage objects scoped to their own draft.
- No new table is required for this fix.

## 9. Validation Rules

- Amount is required before final submission.
- Amount must be `>= 250000`.
- Amount must be `<= 5000000`.
- Eligibility must be completed before starting the application flow.
- Final submission must be blocked until all required document types in `client-ui/src/lib/requirements.ts` have at least one persisted `loan_documents` row for the draft/application.

## 10. Acceptance Criteria

1. A user cannot select or submit a loan amount below R250 000 or above R5 million.
2. All loan amount displays use the `R` symbol and South African number formatting.
3. User-facing lending-rate text reads: "Prime+, up to P+10 based on the quality of the transaction."
4. A user can complete part of the application, save it, leave the flow, return later, and resume the same draft.
5. Documents uploaded during a draft remain visible after refresh and after signing back in.
6. The final review checklist marks a required document as uploaded only when a persisted `loan_documents` row exists for the application.
7. A submitted application includes the same uploaded document records that were visible in the review checklist.
8. The eligibility page shows the approved criteria from section 6.
9. Existing submitted applications are not modified by the migration or client UI changes.

## 11. Test Plan

- Unit tests:
  - loan limit validation rejects `249999` and `5000001`
  - loan limit validation accepts `250000` and `5000000`
  - currency formatter outputs `R` for representative values
  - missing document detection reads persisted document records by doc type
- Integration tests:
  - create draft, save step data, reload, and resume
  - upload a draft document, reload, and verify checklist status
  - submit resumed draft and verify no duplicate application row is created
- Manual QA:
  - complete eligibility checklist
  - start application with R250 000
  - upload all required documents
  - save and close the browser tab
  - resume draft and confirm uploaded documents still show
  - submit and verify final review checklist stayed accurate

## 12. Implementation Notes

- Prefer central constants for loan amount limits and Prime+ display copy to avoid drift across pages.
- Keep document checklist state derived from persisted records wherever an `applicationId` exists.
- Treat in-memory `File` objects as temporary upload inputs only; they must not be the final checklist source of truth.
- Any existing user changes in draft-related files should be preserved and extended rather than rewritten.
