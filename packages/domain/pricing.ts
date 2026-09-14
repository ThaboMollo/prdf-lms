/**
 * PRDF credit-model pricing engine — the single source of truth for the money
 * math confirmed by the product owner/client on 2026-09-10 (see
 * docs/credit-model-phase1-plan.md).
 *
 * Pure, config-driven, no I/O. Imported by admin-ui / client-ui via relative
 * path, and MIRRORED by backend-node/src/common/pricing.ts (backend's
 * tsc rootDir-scoped build can't consume this sibling directly — same sync
 * situation as interest.ts / loanCalc.ts). The two copies are covered by the
 * SAME test vectors (packages/domain/test-pricing.mjs and the backend spec) so
 * any drift fails loudly.
 *
 * Confirmed rules:
 *   - Interest: Principal × AnnualRate% ÷ 365 × DaysFinanced. Simple, daily, on
 *     principal. Frozen at maturity (bullet-at-maturity loans).
 *   - Annual rate: Prime (editable, 10.5%) + risk-grade margin.
 *   - Penalty: NO grace. (Principal + interest) × 2% × (DaysLate ÷ 30). Linear,
 *     non-compounding; never compounds on prior penalties.
 *   - Management fee: Principal × 3%, once-off. Initiation fee: flat R1,000.
 *   - Days/year: 365. Revenue = interest + initiation + management + penalty;
 *     capital is excluded. "Total due to funder" = principal + interest
 *     (excludes fees).
 *   - Rounding: round UP (ceiling) to 2 decimal places (PO decision,
 *     2026-09-10). Applied to final line items, not intermediate daily figures.
 *     Note: this differs from the client's spreadsheet (standard rounding) by a
 *     cent on the worked example; flip roundingMode to 'HALF_UP_2DP' to match
 *     the sheet exactly.
 */

export type RiskGrade = 'Low' | 'Moderate' | 'High' | 'Worst'

export type RoundingMode = 'CEIL_2DP' | 'HALF_UP_2DP'

export interface PricingConfig {
  /** Prime lending rate, percent per annum. Editable. */
  primeRatePct: number
  /** Flat once-off initiation fee, in Rand. */
  initiationFee: number
  /** Management fee, percent of principal, once-off. */
  managementFeePct: number
  /** Penalty rate applied per penalty period, percent. */
  penaltyRatePct: number
  /** Length of one penalty period, in days (penalty reaches penaltyRatePct here). */
  penaltyPeriodDays: number
  /** Days in a year used for the daily interest factor. */
  daysPerYear: number
  /** How final line items are rounded to the cent. */
  roundingMode: RoundingMode
}

export interface QuoteInput {
  principal: number
  daysFinanced: number
  riskGrade: RiskGrade
  /** Risk-grade margin, percent per annum (resolved from the risk_grades table). */
  marginPct: number
  /** Days past maturity. 0 / undefined = no penalty. */
  daysLate?: number
}

export interface LatePaymentScenario {
  daysLate: number
  penalty: number
  totalRevenue: number
}

export interface QuoteBreakdown {
  annualRatePct: number
  interest: number
  initiationFee: number
  managementFee: number
  penalty: number
  /** Principal + interest. Excludes fees. */
  totalDueToFunder: number
  /** Initiation + management. */
  totalFees: number
  /** Interest + initiation + management + penalty. Excludes capital. */
  totalClientRevenue: number
  /** Standard 30/60/90/120-day late buckets for the breakdown table. */
  latePaymentScenarios: LatePaymentScenario[]
}

/** The late-payment buckets shown in every breakdown, matching the spreadsheet. */
export const LATE_SCENARIO_DAYS = [30, 60, 90, 120] as const

/** Round to 2 decimal places under the configured mode. */
export function round2(value: number, mode: RoundingMode): number {
  // Scale, then correct for binary floating-point error before rounding, so
  // e.g. 5063.6986 * 100 = 506369.85999999997 doesn't round the wrong way.
  const scaled = Number((value * 100).toFixed(6))
  const rounded = mode === 'CEIL_2DP' ? Math.ceil(scaled) : Math.round(scaled)
  return rounded / 100
}

/** Annual rate = prime + risk-grade margin, in percent. */
export function annualRate(cfg: PricingConfig, marginPct: number): number {
  return cfg.primeRatePct + marginPct
}

/** Simple daily interest on principal: principal × rate% ÷ daysPerYear × days. */
export function calcInterest(
  cfg: PricingConfig,
  principal: number,
  annualRatePct: number,
  daysFinanced: number,
): number {
  const raw = (principal * (annualRatePct / 100)) / cfg.daysPerYear * daysFinanced
  return round2(raw, cfg.roundingMode)
}

/**
 * Linear, non-compounding penalty on (principal + accrued interest).
 * penalty = base × penaltyRate% × (daysLate ÷ penaltyPeriodDays).
 * Non-compounding by construction: it is a fresh function of the frozen base,
 * never of previously accrued penalty.
 */
export function calcPenalty(
  cfg: PricingConfig,
  principalPlusInterest: number,
  daysLate: number,
): number {
  if (!daysLate || daysLate <= 0) return 0
  const raw =
    principalPlusInterest *
    (cfg.penaltyRatePct / 100) *
    (daysLate / cfg.penaltyPeriodDays)
  return round2(raw, cfg.roundingMode)
}

/** Full quote breakdown for a set of inputs. */
export function quote(cfg: PricingConfig, input: QuoteInput): QuoteBreakdown {
  const ratePct = annualRate(cfg, input.marginPct)
  const interest = calcInterest(cfg, input.principal, ratePct, input.daysFinanced)

  const initiationFee = round2(cfg.initiationFee, cfg.roundingMode)
  const managementFee = round2(
    input.principal * (cfg.managementFeePct / 100),
    cfg.roundingMode,
  )

  // Interest is frozen at maturity; penalty accrues on principal + that
  // frozen interest.
  const penaltyBase = input.principal + interest
  const penalty = calcPenalty(cfg, penaltyBase, input.daysLate ?? 0)

  const totalDueToFunder = round2(input.principal + interest, cfg.roundingMode)
  const totalFees = round2(initiationFee + managementFee, cfg.roundingMode)
  const totalClientRevenue = round2(
    interest + initiationFee + managementFee + penalty,
    cfg.roundingMode,
  )

  const latePaymentScenarios: LatePaymentScenario[] = LATE_SCENARIO_DAYS.map(
    (days) => {
      const scenarioPenalty = calcPenalty(cfg, penaltyBase, days)
      return {
        daysLate: days,
        penalty: scenarioPenalty,
        totalRevenue: round2(
          interest + initiationFee + managementFee + scenarioPenalty,
          cfg.roundingMode,
        ),
      }
    },
  )

  return {
    annualRatePct: ratePct,
    interest,
    initiationFee,
    managementFee,
    penalty,
    totalDueToFunder,
    totalFees,
    totalClientRevenue,
    latePaymentScenarios,
  }
}
