# Validation implementation spec

Target state: one definition of every validation rule, enforced on the server, with errors that arrive at the frontend attached to the field that caused them.

Written 2026-07-29 from an audit of the live code, not from the design docs. Every "current state" claim below has a file reference.

---

## 1. Why this is needed

Three concrete problems, in order of severity.

### 1.1 Field attribution is destroyed three times over

The backend knows exactly which field failed. The frontend receives a string. The information is discarded at three separate points:

| # | Where | What is lost |
|---|---|---|
| 1 | `ValidationPipe` (`backend-node/src/create-app.ts:33`) | class-validator produces `ValidationError[]` with a `property` on each. The default `exceptionFactory` flattens these to `string[]` — field names survive only as English prose inside the sentence. |
| 2 | `AllExceptionsFilter` (`backend-node/src/common/exception.filter.ts`) | Reduces every response to `{ statusCode, message, path }`. Anything structured in `message` is passed through untyped and undocumented. |
| 3 | `parseResponse` (`client-ui/src/lib/api.ts:220`, duplicated at `admin-ui/src/lib/api.ts:303`) | `throw new Error(\`API ${status}: ${await response.text()}\`)` — the entire JSON body is stringified into a message. Nothing downstream can recover the structure. |

Consequence: **no form in either app maps a server error onto a field.** Client-side zod errors do (`ApplyPage.tsx` keeps `errors` keyed by field per step), but a server rejection surfaces only as a toast or a generic banner.

### 1.2 Rules are defined in three places, and the server is the weakest

| Rule source | Location | Enforced where |
|---|---|---|
| Shared zod schemas | `packages/domain/validation.ts` | Client only |
| Wizard step schemas | `client-ui/src/features/applications/validation.ts` (`step1Schema`…`step5Schema`) | Client only |
| class-validator DTOs | `backend-node/src/*/dto/*.ts` | Server |

The DTOs are markedly looser than the client schemas. Measured across all DTOs: 49 × `@IsOptional`, 36 × `@IsString`, 15 × `@Min`, 2 × `@IsIn`. Specific divergences:

| Field | Client rule | Server rule | Gap |
|---|---|---|---|
| `saCitizenshipPercentage` | `0–100` | `@IsNumber()` | No range check |
| `numberOfEmployees` | `min 1` | `@IsInt() @Min(0)` | 0 accepted |
| `province`, `spatialType`, `industry`, `gender` | enum / fixed list | `@IsString()` | Any string accepted |
| `sarsTaxPin` | `min 5` | `@IsOptional() @IsString()` | No length rule |
| `bankName` | `min 2` | `@IsOptional() @IsString()` | No length rule |

Anything enforced only in the browser is advisory — the API is directly callable, which is the same reasoning that drove the S2 upload fix and the S4 MFA decision.

### 1.3 Numeric inputs accept non-numeric input

9 inputs use `type="number"`; none use `inputMode`, and none sanitise paste. `type="number"` still permits `e`, `E`, `+`, `-`, `.` and, in most browsers, arbitrary pasted text — which yields `''` from `e.target.value`, silently becoming `0` or `NaN` after coercion.

Numeric-intent fields currently on free text: `phoneNumber` (`RegisterPage`, `ApplyPage`), `sarsTaxPin`, `registrationNo` (`admin-ui/ApplicationsPage.tsx:736`).

**Not a defect:** `loanPurposeCategory` is client-only by design — `ApplyPage.tsx:269` folds it into `purpose` as `"<category>: <text>"` before sending. It is correctly absent from the DTO.

---

## 2. The error contract

One response shape for every 4xx the API returns.

```jsonc
{
  "statusCode": 400,
  "path": "/api/applications",
  "message": "Please correct the highlighted fields.",  // banner-level summary
  "errors": [                                           // field-level, may be empty
    { "field": "requestedAmount", "message": "Minimum loan amount is R250,000.", "code": "min" },
    { "field": "termMonths",      "message": "Maximum 60 months.",              "code": "max" }
  ]
}
```

Rules:

- `errors` is **always present** on a 400 from validation, **always an array**, possibly empty.
- `field` uses the **wire name** (the DTO property, e.g. `requestedAmount`), not a label. The frontend owns labels.
- Nested/array fields use dotted paths (`schedule.0.dueDate`) so a form can address them.
- `message` is user-facing prose. It is written to be shown verbatim — no error codes leaking into the UI.
- `code` is a stable machine token (`required`, `min`, `max`, `pattern`, `enum`, `conflict`). Optional for the frontend to use; useful for tests that shouldn't assert on prose.
- Errors that are genuinely not field-specific (permission, conflict, not-found) return `errors: []` and rely on `message`.

This shape is additive — `statusCode`/`message`/`path` keep their current meaning, so nothing that reads them today breaks.

---

## 3. Workstream A — Backend emits structured errors

**A1. Custom `exceptionFactory` on `ValidationPipe`** ✅ **DONE 2026-07-29**

`backend-node/src/common/validation-errors.ts`, wired in `create-app.ts`. Emits the §2 contract; nested/array fields get dotted paths; only the first constraint per field is reported (one bad number can trip `isNumber`, `isPositive` and `min` at once, and three messages under one input is noise). `forbidNonWhitelisted` rejections are attributed to the offending property with code `unknown`. 6 assertions in the API integration suite verify the shape survives to the wire.

Wire response now:

```jsonc
{ "statusCode": 400,
  "message": "Please correct the highlighted fields.",
  "errors": [
    { "field": "requestedAmount", "message": "requestedAmount must be a positive number", "code": "min" },
    { "field": "termMonths",      "message": "termMonths must not be less than 1",        "code": "min" }
  ] }
```

<details><summary>Original plan</summary>

Replace the default with one that walks `ValidationError[]`, recurses through `children` to build dotted paths, and throws a `BadRequestException` carrying the contract above. Take the first constraint per field to avoid a wall of messages for one input; keep the constraint key as `code`.

Keep `whitelist: true` and `forbidNonWhitelisted: true`. Note that `forbidNonWhitelisted` produces `property X should not exist` errors — map those to `field: X, code: 'unknown'` rather than letting them surface as prose.

</details>

**A2. Teach `AllExceptionsFilter` to pass `errors` through** ✅ **DONE** (landed during multi-tenant step 6 — the cron sweep's per-tenant results were being flattened the same way)

Currently the filter reads only `.message` off the response body. Read `.errors` as well and include it when present; default to `[]` otherwise, so the contract holds for every 4xx.

**A3. Replace substring-matched status inference**

`exception.filter.ts` currently infers status by string-matching thrown messages (`msg.includes('invalid')`, `'not found'`, `'only admin'` …). This is fragile — the wording of a domain error silently determines its HTTP status, and a reworded message changes the status code.

Introduce typed domain errors (`ValidationError`, `PermissionError`, `NotFoundError`, `ConflictError`) in `backend-node/src/common/errors.ts`, throw those from services, and map them explicitly. `ValidationError` carries `field`, so a service-level rule (e.g. "requested amount exceeds the product maximum") lands on the right input, not just in a banner.

Retain the substring fallback initially, marked deprecated, so untouched services keep their current status codes while they're migrated.

**A4. Tighten the DTOs** — close every row in §1.2. Add `@Min`/`@Max` on `saCitizenshipPercentage`, `@Min(1)` on `numberOfEmployees`, `@IsIn([...])` on the four enum-ish fields (sourced from `packages/domain`, see Workstream B), length rules on `sarsTaxPin`/`bankName`.

---

## 4. Workstream B — One source of validation truth

The rules exist as zod (frontend) and class-validator (backend). Rather than a risky unification, make **`packages/domain` the single source for the *values*** — the enums, bounds and regexes — and let each side express them in its own idiom.

```ts
// packages/domain/constraints.ts
export const PROVINCES = ['Gauteng', 'Western Cape', /* … */] as const
export const SPATIAL_TYPES = ['Rural', 'Township', 'City'] as const
export const GENDERS = ['Male', 'Female', 'Prefer not to say'] as const
export const SA_CITIZENSHIP_PCT = { min: 0, max: 100 } as const
export const EMPLOYEES = { min: 1 } as const
export const SARS_TAX_PIN = { minLength: 5 } as const
export const PHONE_SA = /^0\d{9}$/          // used by both sides
```

Frontend zod and backend `@IsIn(...)`/`@Min(...)` both import these. Amount/term/rate bounds are **not** included — those already live in `loan_products` and are read at runtime (`useLoanProduct`, `validate_loan_application_against_product` trigger). Hardcoding them here would reintroduce exactly what Phase 2 removed.

`backend-node` currently cannot import `packages/*` (its `tsc` build is `rootDir`-scoped — the same constraint that keeps `LOAN_STATUS_TRANSITIONS` duplicated). Two options, in preference order:

1. Emit `constraints.ts` into `backend-node/src/common/generated-constraints.ts` via a small `npm run sync:constraints` script, checked into git, with a CI check that it matches the source. Explicit, reviewable, no build-system change.
2. Restructure `rootDir`. Larger blast radius; only if option 1 proves annoying.

---

## 5. Workstream C — Frontend consumes errors structurally

**C1. Stop stringifying the body.** Replace `parseResponse` in *both* apps with one that preserves structure:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: FieldError[] = [],
  ) { super(message) }

  /** Field name -> first message, ready to merge into a form's error state. */
  fieldMap(): Record<string, string> { /* … */ }
}
```

Both apps' `lib/api.ts` currently duplicate this function verbatim — extract it to `packages/domain` (framework-free, already consumed by both) rather than fixing it twice.

**C2. A shared hook for form error state.**

```ts
const { fieldErrors, formError, submit, clearField } = useFormErrors()
```

`submit` runs the local zod parse first, then the request; on an `ApiError` it merges `fieldMap()` into `fieldErrors`. One state shape holds both client and server errors, so a field renders identically regardless of which side rejected it. Server errors clear on next edit of that field.

**C3. `FieldError` everywhere.** `client-ui/src/components/shared/FieldError.tsx` exists; **`admin-ui` has no equivalent** and shows nothing per-field. Move it to `packages/ui-kit` (already the shared component home) and adopt it in both.

Accessibility, currently absent: `aria-invalid` on the input, `aria-describedby` pointing at the message id, `role="alert"` on the message (already present in `FieldError`), and focus moved to the first invalid field on submit.

---

## 6. Workstream D — Numeric input hardening

A shared `<NumericInput>` in `packages/ui-kit`, replacing raw `type="number"`:

- `inputMode="numeric"` / `"decimal"` — correct mobile keypad.
- Rejects keystrokes and paste that don't match the allowed shape, rather than relying on `type="number"`, which permits `e`/`+`/`-` and yields `''` for invalid content.
- `integer` | `decimal` | `currency` mode; `currency` displays thousands separators while holding an unformatted numeric value.
- Emits `number | null`, never `NaN`, never `''` — the current `z.coerce.number()` path turns `''` into `0`, which is silently wrong for an amount.
- Keeps the value as a string in local state while typing (so a half-typed `1.` doesn't get mangled) and commits a number on blur.

**Fields to convert.** Numeric today, to `<NumericInput>`: `requestedAmount`, `termMonths`, `monthlyRevenue`, `yearsInOperation`, `numberOfEmployees`, `saCitizenshipPercentage`, `disburseAmount`, `repaymentAmount`, `nfsDuration`. Free-text but numeric-intent, to constrained input: `phoneNumber` (SA mobile pattern), `sarsTaxPin`, `registrationNo` (CIPC format — confirm the real format before constraining; over-restricting a registration number is worse than under-restricting).

**Deliberately not numeric:** `purpose`, `businessName`, `address*`, `bankName`, note/task bodies.

---

## 7. Form inventory

Every form, and what it needs. Ordered by user impact.

| Form | File | Inputs | Needs |
|---|---|---|---|
| Apply wizard (5 steps) | `client-ui/pages/ApplyPage.tsx` | 19 | C2, C3, D — the highest-value target; already has per-field client errors, needs server errors merged in |
| Staff application create / status / upload / notes / tasks / NFS | `admin-ui/pages/ApplicationsPage.tsx` | 22 | C2, C3 (no `FieldError` at all today), D |
| Register | `client-ui/pages/RegisterPage.tsx` | 5 | C2, C3, D (`phoneNumber`); currently shows only a single Supabase error string |
| Login (both apps) | `*/pages/LoginPage.tsx` | 2 each | C3 — email format inline rather than one banner |
| Disbursement / repayment | `admin-ui/pages/LoanDetailsPage.tsx` | 4 | D (money fields), C2/C3 |
| User access | `admin-ui/pages/UserAccessPage.tsx` | 4 | C3 |
| Address block | `client-ui/components/shared/AddressFields.tsx` | 5 | C3 |
| MFA challenge / enrolment | `admin-ui/features/mfa/*` | 1 each | Already constrains to 6 digits; adopt `<NumericInput>` for consistency |
| Documents upload | `client-ui/pages/DocumentsPage.tsx` | 1 | Surface the S2 server-side type rejection on the field |
| Eligibility checklist | `client-ui/pages/EligibilityCheckPage.tsx` | 1 | None — checkbox gate, no free input |

---

## 8. Verification

Build-passing is not evidence here; that lesson has been expensive on this project twice already.

- **Backend contract tests** (`backend-node/scripts/`, matching the existing plain-Node pattern used by `test-file-validation.mjs`): post a deliberately invalid payload to each mutating endpoint and assert the response matches the §2 shape — `errors` present, correct `field`, correct `code`.
- **A bypass test per rule in §1.2**: send the value the browser would refuse (`saCitizenshipPercentage: 500`, `numberOfEmployees: 0`, `province: "Atlantis"`) directly to the API and assert a 400. These are the assertions that prove the rules are real rather than decorative.
- **Constraint-drift check in CI**: fail if `backend-node/src/common/generated-constraints.ts` differs from `packages/domain/constraints.ts`.
- **A real browser pass per form** — submit invalid, confirm the message renders against the right input, confirm focus lands on the first invalid field, confirm editing clears it. This cannot be inferred from types; the duplicate-React outage shipped through a clean build.

---

## 9. Sequencing

Each step is independently shippable and leaves the app working.

1. ~~**A1 + A2** — backend emits `errors`; nothing consumes it yet. Zero user-visible change.~~ **Done.** `backend-node/src/common/validation-errors.ts`; 6 assertions in `test-api-integration.mjs`.
2. ~~**C1** — `ApiError` in `packages/domain`, both apps parse it. Still no visual change, but errors stop being stringified.~~ **Done.** `packages/domain/api-error.ts`; 24 assertions in `packages/domain/test-api-error.mjs`, wired into CI.
3. ~~**C2 + C3** — hook + `FieldError` in `ui-kit`; adopt on **one** form and verify end to end before spreading.~~ **Done.** `packages/ui-kit/hooks/useFormErrors.ts`; 21 assertions in `packages/ui-kit/test-form-errors.mjs`, wired into CI. Adopted on RegisterPage, ApplyPage and admin-ui LoanDetailsPage; the rest of the §7 inventory still to go.
4. ~~**A4 + B** — tighten DTOs against shared constraints.~~ **Done.** `packages/domain/constraints.ts` is the single source; `backend-node/scripts/generate-constraints.mjs` mirrors it into src with a CI drift check. 20 new assertions in the API integration suite (73 total).
5. **D** — `<NumericInput>`, rolled out per the §7 table.
6. **A3** — typed domain errors, migrating services incrementally behind the deprecated fallback.

Step 4 before step 3 is the ordering mistake to avoid: tightening server rules while the frontend still swallows the response means users get a generic failure with no indication of which field is wrong.

### C3 as built

`packages/ui-kit/components/FieldError.tsx` exports four things, re-exported through each app's `components/shared/FieldError.tsx` (the convention the other shared components already follow):

| Export | Purpose |
|---|---|
| `FieldError` | The message. Now takes `field` so it can carry a stable id. |
| `fieldErrorAttrs(field, message)` | Spread onto the input — emits `aria-invalid` + `aria-describedby`, nothing when valid. |
| `focusFirstInvalidField(errors)` | Moves focus, resolving *document* order rather than object-key order. |
| `fieldErrorId(field)` | The id both sides agree on. |

**The convention this rests on:** an input's `id` === its error key === the DTO property the backend reports in `errors[].field`. One name end to end is what lets a server rejection reach the right input without a lookup table.

Adopted so far:

- **ApplyPage** — all 13 fields wired with aria attributes; focus moves to the first invalid field on each of the three step validations; server `errors` from submit are listed on the review step (those inputs aren't mounted there, so they can't be highlighted in place).
- **RegisterPage** — full client-side validation with per-field messages, SA mobile-number pattern, errors clearing on edit, and Supabase Auth errors attributed to a field where the prose allows it. This is the one place matching on English is unavoidable: `supabase.auth.signUp` is not our API and returns no structured `errors`. Unmatched messages fall back to the banner rather than being guessed onto a field.

Also added: `input[aria-invalid='true']` alongside `:user-invalid` in both apps' CSS. `:user-invalid` only covers constraints the *browser* can check, so without it a server-rejected field showed its message while still looking valid.

Still to adopt: the admin-ui forms in §7, `LoginPage` (both apps), `AddressFields`.

**One structural gotcha, if you extend this to forms built like RegisterPage was.** A `<label>` that *wraps* its input must not also contain the `FieldError`. Per the accessible-name spec, a label's contents (other than the wrapped control) become part of the input's accessible name — so a nested error both renames the field and gets announced twice, once as the name and once via `aria-describedby`. RegisterPage was restructured to `.field-block > (label.form-field + FieldError)` for this reason. ApplyPage was already safe, using a `div.form-field` with a sibling `<label htmlFor>`.

### C2 as built

`useFormErrors()` returns `{ fieldErrors, formError, submitting, submit, clearField, setFieldErrors, reset, idPrefix }`.

`submit(request, { validate })` runs the local checks, then the request; it resolves to the request's value on success and `undefined` on any failure, so callers branch on the result instead of duplicating error handling. Double-submit is blocked through a ref rather than the `submitting` state — reading state would see the value captured when the callback was created, and on a disbursement that means paying twice.

**The routing rule.** A failure becomes a *field* error only if the server attributed it (`ApiError.hasFieldErrors`). Everything else — a network drop, a 500, a 403 — goes to the banner, because it is not the user's input being wrong and highlighting an input would send them to fix a healthy field.

The banner then appears **exactly when nothing could be pointed at**: `submit` focuses the first invalid input and suppresses the banner if that succeeded (the message is already visible on the field), or carries the message if it didn't (the field isn't mounted — the apply wizard's review step). One failure, shown once. The `test-form-errors.mjs` suite asserts both halves of that invariant.

The decision logic is four exported pure functions with the hook as thin glue, so all of the above is testable without a DOM.

**Two things this surfaced, both fixed:**

1. **The `id === field name` convention collides when two forms share a page.** Loan Details has Disburse and Record Repayment, and *both* DTOs call the field `amount`. Two elements with `id="amount"` is invalid HTML and `getElementById` returns whichever came first, so focus landed in the wrong form. `fieldDomId(field, idPrefix)` namespaces the DOM id; the error **key** stays the bare wire name, since that is what the server reports.

2. **The reported constraint was arbitrary.** `flattenValidationErrors` took `Object.entries(constraints)[0]` — decorator-evaluation order. `amount: "lots"` fails `isNumber`, `isPositive` and `min` at once, and it was reporting *"must be a positive number"*, sending the user hunting for a bigger number when they had typed a word. Now ordered by `CONSTRAINT_PRIORITY`: missing > wrong type > wrong format > everything else, since a type error explains every range failure downstream.

Also on Loan Details: the two forms shared one `formError`, so a failed disbursement rendered a red message above the repayment form too. They now hold independent state. And the buttons are no longer disabled on a zero amount — a disabled button explains nothing; submitting and showing the reason on the field does.

### A note on the harness

`bootApi` now refuses to run when `src/` is newer than the last build. The suites boot `dist/main.js`, not the sources; CI builds first but a local run does not, so editing a file and immediately running the suite silently tested the *previous* build. That cost a debugging cycle during this work — a green run that said nothing about the change just made.

Freshness is measured against `dist/tsconfig.tsbuildinfo`, not the emitted `.js` files: the build is incremental, so an unchanged file is not re-emitted and `dist/` legitimately keeps an older mtime. `tsbuildinfo` is rewritten whenever a build completes, which makes it the honest marker.

### A4 + B as built

`packages/domain/constraints.ts` holds the closed sets and the numeric/length limits, in plain TypeScript — no zod, no class-validator, so neither library's vocabulary leaks into the shared definition. Both validators are built from it: the wizard's zod schemas import it directly, and `backend-node/scripts/generate-constraints.mjs` mirrors it into `src/common/generated-constraints.ts`.

The mirror exists because backend-node's tsconfig `include: ["src/**/*"]` cannot reach outside `src/` — the same constraint that already forced a second copy of `LOAN_STATUS_TRANSITIONS`. The difference is that this copy is generated and drift-checked in CI, so it cannot silently diverge; a hand-maintained copy would reproduce the original problem one level down.

Every row in §1.2 is now closed. `AddressFields` and the wizard's industry dropdown render from the same lists the DTOs validate against, so an option the UI offers can never be one the server rejects.

**Three things this surfaced that were not in the original plan:**

**1. The industry list was replaced wholesale, and a naive `@IsIn` would have broken existing users.** Commit `9504be9` (2026-07-15) swapped the generic list (`Retail`, `Manufacturing`, …) for the blue-economy one. `industry` has no database CHECK, so client profiles written before that date still hold the old values — and `patchClientProfile` resends the stored value on any update. Validating against the current list alone would have rejected those users mid-application for no security benefit. `ACCEPTED_INDUSTRIES` = current + `RETIRED_INDUSTRIES`; the dropdown offers only the current ones. A closed legacy set still stops arbitrary strings, which is the entire point of the check. Delete `RETIRED_INDUSTRIES` once no `clients` row holds one.

**2. Tightening the DTOs broke wizard autosave, and the build did not say so.** `@IsOptional()` skips only `undefined` and `null` — an empty string is still validated. `buildDraftPayload` sends `purpose: ''`, `industry: ''`, `businessName: ''` for every field the user has not reached, on a debounce while they type. A single ordinary autosave produced **nine** validation errors. `@AllowBlank()` (a `ValidateIf` that skips `''`) restores it. Deliberately not a transform to `undefined`: the service uses set-if-provided, where `undefined` means "leave the stored value alone" and `''` means "clear it", and collapsing the two would make clearing a field impossible.

**3. Nothing enforced completeness at submit.** The only submit-time checks were loan limits and required documents, so an application could be submitted with an empty purpose — verified by deleting the new check and watching the suite return **201** on exactly that. `ensureApplicationComplete()` now runs first and reports through the §2 contract, so the wizard's review step lists each missing field.

**Open policy question — not a technical one.** That completeness check covers only what *both* intake paths collect. admin-ui's staff-assisted flow (`CreateAssistedClientDto`) captures business name, registration number and address; it never collects `industry`, `province`, `spatialType`, `gender`, `saCitizenshipPercentage`, `sarsTaxPin`, `bankName` or `numberOfEmployees`, all of which the borrower wizard requires. Requiring them at submit would block staff from submitting anything they captured. **Whether staff should be able to submit an application without BEE/demographic data is a business decision** — these are the fields the DFI reports on. If the answer is no, the fix is to add them to the staff-assisted form, not to relax the wizard.

**Also guarded:** the suite now asserts the `province` and `spatial_type` CHECK constraints in the database match the generated `@IsIn` lists. Those are two independent definitions of one rule and can drift either way — a value the DTO accepts but the CHECK rejects becomes a 500 at write time (confirmed by sabotage), and one the CHECK accepts but the DTO rejects is a dropdown option nobody can submit.
