# Credit Model — Phase 1 Implementation Plan (Pricing Engine)

**Status:** Draft for review · **Date:** 2026-09-10
**Scope owner:** Thabo · **Source of truth for rules:** PO/client confirmations of 2026-09-10 (5-point email reply)

---

## 1. Objective

Implement the PRDF credit-calculation model (from Theo's email + `PRDF_Credit_Model_With_Total_Client_Revenue.xlsx`) as a **pure, config-driven pricing engine** with a **read-only quote breakdown** on the admin case page and a `POST /api/pricing/quote` endpoint.

Phase 1 is the **calculator only**. It does **not** touch loan disbursement, the repayment schedule, or the existing monthly-amortising engine (`interest.ts` / `buildRepaymentSchedule`). Those change in Phase 2, when bullet-at-maturity loans replace/augment the monthly product.

**Why calculator-first:** it lets us validate the numbers against Theo's worked examples to the cent, get sign-off on the money math in isolation, and reuse the exact same pure functions in Phase 2's schedule/booking path — no re-derivation.

---

## 2. Confirmed rules (build to these exactly)

| # | Rule | Formula / value |
|---|------|-----------------|
| 1 | Interest | `Principal × AnnualRate ÷ 365 × DaysFinanced`. Simple, daily, on principal. Frozen at maturity (bullet). |
| 1a | Annual rate | `Prime (10.5%, editable) + risk-grade margin`. Low +5 / Moderate +6.5 / High +8.5 / Worst +10.5 → **15.5 / 17 / 19 / 21%**. |
| 2 | Penalty accrual | **No grace.** Daily from first overdue day at `2% ÷ 30` per day; = 2% at 30 days. |
| 3 | Penalty amount | `(Principal + accruedInterest) × 2% × (DaysLate ÷ 30)`. Linear, **non-compounding**; never compounds on prior penalties. |
| 4 | Management fee | `Principal × 3%`, once-off (principal only). |
| 5 | Initiation fee | Flat **R1,000**, once-off. |
| 6 | Days/year | **365**. |
| 7 | Revenue split | 4 income streams: interest, initiation, management, penalty. **Capital excluded** from revenue. "Total due to funder" = principal + interest (**excludes fees**). |

Risk grade is set by the **Risk Analyst at Due Diligence** (persistence is Phase 2; in Phase 1 it is an input to the quote).

### Rounding — DECISION: round **up** (ceiling) to 2 decimal places

Configured as a single constant `ROUNDING_MODE = 'CEIL_2DP'`. **Divergence to note:** ceiling differs from the spreadsheet's standard rounding by a cent on the worked example (interest R3,184.94 vs sheet R3,184.93; total R16,748.64 vs sheet R16,748.63). If the client wants the sheet's values exactly, flip the constant to `HALF_UP_2DP` — one line, and the alternate test vector is already written. Rounding is applied to **final line items**, not intermediate daily figures.

---

## 3. Architecture

### 3.1 Shared pure engine

Canonical file: **`packages/domain/pricing.ts`** — pure functions, no I/O, no framework. Imported by the UIs via relative path (`../../../../packages/domain/pricing`), matching the existing `consent.ts` / `validation.ts` / `api-error.ts` precedent.

**Sync tax (known constraint):** backend-node cannot cleanly consume the sibling `packages/domain` package (its `tsc` `rootDir`-scoped build). Today `interest.ts` (backend) and `loanCalc.ts` (×2 UIs) are hand-synced 3 ways. To avoid extending that debt:

- **Option A (chosen for Phase 1):** keep the canonical engine in `packages/domain/pricing.ts`; add a thin backend copy `backend-node/src/common/pricing.ts` with a header pointing at the canonical file, kept in sync by hand — same pattern as `interest.ts`, so no new mechanism to learn. Both files are covered by the **same test vectors** (§7), which fail loudly on drift.
- **Option B (flagged, not in Phase 1):** publish `packages/domain` as a real workspace package and have backend consume it — retires the whole 3-way sync problem but is a build-system change with blast radius beyond this feature. Recommend as a separate infra ticket.

### 3.2 Config-driven (new tables)

New migration adds:

- **`pricing_config`** — singleton row of tunables: `prime_rate_pct`, `initiation_fee`, `management_fee_pct`, `penalty_rate_pct`, `penalty_period_days` (30), `days_per_year` (365), `rounding_mode`. Seeded with the confirmed values. Editable later without a code deploy.
- **`risk_grades`** — `grade` (Low/Moderate/High/Worst), `margin_pct` (5 / 6.5 / 8.5 / 10.5), `sort_order`, `is_active`. Seeded.

Product amount/term **bands** stay on `loan_products` for now. Note: the client model expresses term in **days** (90 / 180 / 365 / 730 / 1095) while `loan_products.min/max_term_months` is in months. Phase 1 quote takes `daysFinanced` directly, so no schema change to `loan_products` is required yet; reconciling the two term units belongs to Phase 2 (product redesign — see §10).

### 3.3 Data flow

```
Admin case page (Risk Analyst picks grade + enters days/amount)
  → POST /api/pricing/quote
    → PricingService: load pricing_config + risk_grades (cached), call domain/pricing.quote()
      → returns QuoteBreakdown (interest, fees, penalty buckets, revenue split)
  → read-only breakdown panel renders it
```

---

## 4. Engine API (`packages/domain/pricing.ts`)

```ts
export type RiskGrade = 'Low' | 'Moderate' | 'High' | 'Worst';

export interface PricingConfig {
  primeRatePct: number;        // 10.5
  initiationFee: number;       // 1000
  managementFeePct: number;    // 3
  penaltyRatePct: number;      // 2
  penaltyPeriodDays: number;   // 30
  daysPerYear: number;         // 365
  roundingMode: 'CEIL_2DP' | 'HALF_UP_2DP';
}

export interface QuoteInput {
  principal: number;
  daysFinanced: number;
  riskGrade: RiskGrade;
  marginPct: number;           // resolved from risk_grades for the grade
  daysLate?: number;           // optional; 0/undefined = no penalty
}

export interface QuoteBreakdown {
  annualRatePct: number;       // prime + margin
  interest: number;            // principal × rate ÷ 365 × daysFinanced
  initiationFee: number;
  managementFee: number;       // principal × 3%
  penalty: number;             // 0 if daysLate falsy
  totalDueToFunder: number;    // principal + interest (excl. fees)
  totalFees: number;           // initiation + management
  totalClientRevenue: number;  // interest + initiation + management + penalty
  latePaymentScenarios: Array<{ daysLate: number; penalty: number; totalRevenue: number }>; // 30/60/90/120
}

export function round2(value: number, mode: PricingConfig['roundingMode']): number;
export function annualRate(cfg: PricingConfig, marginPct: number): number;
export function calcInterest(cfg: PricingConfig, principal: number, ratePct: number, days: number): number;
export function calcPenalty(cfg: PricingConfig, principalPlusInterest: number, daysLate: number): number;
export function quote(cfg: PricingConfig, input: QuoteInput): QuoteBreakdown;
```

- All money outputs pass through `round2(_, cfg.roundingMode)`.
- `calcPenalty` uses `(daysLate / penaltyPeriodDays)` linearly — non-compounding by construction (penalty is a fresh function of the frozen principal+interest, never of prior penalty).
- `latePaymentScenarios` always returns the 30/60/90/120 buckets for the breakdown table.

---

## 5. Backend (`backend-node`)

- **`backend-node/src/common/pricing.ts`** — synced copy of the engine (header points at canonical).
- **`backend-node/src/pricing/pricing.module.ts` / `.service.ts` / `.controller.ts`**:
  - `PricingService.getConfig()` loads `pricing_config` + `risk_grades` (cache with short TTL; these change rarely).
  - `PricingService.quote(input)` resolves `marginPct` from the grade, calls `pricing.quote()`.
  - `@Controller('api/pricing')` · `@Post('quote')` · `QuoteDto` (validated: principal > 0, daysFinanced > 0, riskGrade ∈ enum, daysLate ≥ 0 optional).
  - **AuthZ:** internal roles only (reuse the existing guard); the quote is staff-facing. No client-portal exposure in Phase 1 (deferred — see §10).

---

## 6. Admin UI (`admin-ui`)

- Read-only **Quote Breakdown** panel on the case/application detail page.
- Inputs: amount (prefilled from `requested_amount`), days financed, risk-grade selector (defaults to the grade the Risk Analyst set at Due Diligence once persisted; free-select for preview in Phase 1).
- Renders: annual rate, interest, initiation, management, penalty, total due to funder, total fees, **total client revenue**, and the 30/60/90/120 late-scenario table — mirroring the spreadsheet layout.
- Uses `packages/domain/pricing` types directly; calls `POST /api/pricing/quote` (server is source of truth for config values).

---

## 7. Tests (worked example to the cent)

Canonical vector — **R250,000 · Low (margin 5 → 15.5%) · 30 days financed**, `CEIL_2DP`:

| Line | Value (CEIL_2DP) | (HALF_UP_2DP alt) |
|------|------------------|-------------------|
| Interest | R3,184.94 | R3,184.93 |
| Initiation | R1,000.00 | R1,000.00 |
| Management | R7,500.00 | R7,500.00 |
| Penalty @30d late | R5,063.70 | R5,063.70 |
| Total due to funder | R253,184.94 | R253,184.93 |
| **Total client revenue @30d** | **R16,748.64** | **R16,748.63** |

Late-scenario penalties (CEIL_2DP): 30d R5,063.70 · 60d R10,127.40 · 90d R15,191.10 · 120d R20,254.80.

- Unit tests on `packages/domain/pricing.ts` asserting each line for both rounding modes.
- Mirror test on `backend-node/src/common/pricing.ts` with the **same vectors** → drift between the two copies fails CI.
- Property test: penalty is linear in `daysLate` (penalty(2n) = 2 × penalty(n) before rounding) — guards against accidental compounding.
- Edge cases: `daysLate = 0` → penalty 0; `daysFinanced = 0` → interest 0; each risk grade → correct annual rate.

---

## 8. Migrations

1. `infra/supabase/migrations/<ts>_pricing_config_and_risk_grades.sql` — create + seed `pricing_config` (singleton) and `risk_grades` (4 rows). Additive only; RLS: readable by internal roles, writable by Admin/SuperAdmin (config tuning is an admin action).

No changes to `loan_products`, `loans`, or the schedule in Phase 1.

---

## 9. Verification

1. `cd packages/domain && node --test` (or the repo's test runner) → pricing vectors pass.
2. `cd backend-node && npm run build && npm test` → backend copy vectors pass; drift check green.
3. `cd admin-ui && npm run build` → no type errors from the new panel.
4. Apply migration to a throwaway/local DB; confirm `pricing_config` + `risk_grades` seed correctly.
5. Manual: as a Risk Analyst test user, open a case, enter R250k / Moderate / 30 days → breakdown matches §7; toggle late scenarios → penalties match.
6. Confirm no client-portal route exposes the quote (internal-only guard).

---

## 10. Out of scope / Phase 2 handoff / open items

- **Phase 2:** bullet-at-maturity loan booking, maturity interest freeze + arrears penalty accrual on real loans, replacing/augmenting the monthly `buildRepaymentSchedule`, persisting the Risk-Analyst-chosen grade on the application, and the new products (Purchase Order Funding R250k–500k ~90d; Short-Term Contract Funding R500k–1m 180/365/730/1095d).
- **Term units:** client model uses days; `loan_products` uses months — reconcile in Phase 2 product redesign.
- **Products decision (open):** do the two new products **replace** or **sit alongside** "PRDF Standard"? Needed before Phase 2 schema work.
- **Client-portal quote visibility (open):** Phase 1 is staff-only. Decide whether applicants see an indicative quote.
- **Rounding (resolved as CEIL_2DP, but note the 1-cent divergence from the client's sheet):** confirm with client if their published figures must match exactly → flip to `HALF_UP_2DP`.
- **Spreadsheet fixes owed by client:** correct the Late-Payment interest cell (use Days Financed, not "Total due to Funder") and amend the "after 30 days" penalty wording to reflect no-grace daily accrual.
- **Sync-tax retirement (Option B):** separate infra ticket to make `packages/domain` a real workspace package consumed by backend.
