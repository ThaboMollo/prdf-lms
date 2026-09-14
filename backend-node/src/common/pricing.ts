/**
 * SYNCED COPY of packages/domain/pricing.ts — keep the two byte-for-byte
 * identical in logic. backend-node's tsc rootDir-scoped build can't consume the
 * sibling packages/domain directly (same reason interest.ts is a hand-synced
 * copy of loanCalc.ts). The canonical file and this copy are checked against
 * each other by the drift section of packages/domain/test-pricing.mjs, which
 * bundles BOTH files and asserts identical output — so any divergence fails
 * loudly. (backend-node has no test runner of its own; build is `tsc` only.)
 *
 * Do not add backend-only logic here — this file must stay a pure mirror.
 * See docs/credit-model-phase1-plan.md for the confirmed rules.
 */

export type RiskGrade = 'Low' | 'Moderate' | 'High' | 'Worst';

export type RoundingMode = 'CEIL_2DP' | 'HALF_UP_2DP';

export interface PricingConfig {
  primeRatePct: number;
  initiationFee: number;
  managementFeePct: number;
  penaltyRatePct: number;
  penaltyPeriodDays: number;
  daysPerYear: number;
  roundingMode: RoundingMode;
}

export interface QuoteInput {
  principal: number;
  daysFinanced: number;
  riskGrade: RiskGrade;
  marginPct: number;
  daysLate?: number;
}

export interface LatePaymentScenario {
  daysLate: number;
  penalty: number;
  totalRevenue: number;
}

export interface QuoteBreakdown {
  annualRatePct: number;
  interest: number;
  initiationFee: number;
  managementFee: number;
  penalty: number;
  totalDueToFunder: number;
  totalFees: number;
  totalClientRevenue: number;
  latePaymentScenarios: LatePaymentScenario[];
}

export const LATE_SCENARIO_DAYS = [30, 60, 90, 120] as const;

/** Round to 2 decimal places under the configured mode. */
export function round2(value: number, mode: RoundingMode): number {
  const scaled = Number((value * 100).toFixed(6));
  const rounded = mode === 'CEIL_2DP' ? Math.ceil(scaled) : Math.round(scaled);
  return rounded / 100;
}

/** Annual rate = prime + risk-grade margin, in percent. */
export function annualRate(cfg: PricingConfig, marginPct: number): number {
  return cfg.primeRatePct + marginPct;
}

/** Simple daily interest on principal: principal × rate% ÷ daysPerYear × days. */
export function calcInterest(
  cfg: PricingConfig,
  principal: number,
  annualRatePct: number,
  daysFinanced: number,
): number {
  const raw = ((principal * (annualRatePct / 100)) / cfg.daysPerYear) * daysFinanced;
  return round2(raw, cfg.roundingMode);
}

/**
 * Linear, non-compounding penalty on (principal + accrued interest).
 * penalty = base × penaltyRate% × (daysLate ÷ penaltyPeriodDays).
 */
export function calcPenalty(
  cfg: PricingConfig,
  principalPlusInterest: number,
  daysLate: number,
): number {
  if (!daysLate || daysLate <= 0) return 0;
  const raw =
    principalPlusInterest * (cfg.penaltyRatePct / 100) * (daysLate / cfg.penaltyPeriodDays);
  return round2(raw, cfg.roundingMode);
}

/** Full quote breakdown for a set of inputs. */
export function quote(cfg: PricingConfig, input: QuoteInput): QuoteBreakdown {
  const ratePct = annualRate(cfg, input.marginPct);
  const interest = calcInterest(cfg, input.principal, ratePct, input.daysFinanced);

  const initiationFee = round2(cfg.initiationFee, cfg.roundingMode);
  const managementFee = round2(input.principal * (cfg.managementFeePct / 100), cfg.roundingMode);

  const penaltyBase = input.principal + interest;
  const penalty = calcPenalty(cfg, penaltyBase, input.daysLate ?? 0);

  const totalDueToFunder = round2(input.principal + interest, cfg.roundingMode);
  const totalFees = round2(initiationFee + managementFee, cfg.roundingMode);
  const totalClientRevenue = round2(
    interest + initiationFee + managementFee + penalty,
    cfg.roundingMode,
  );

  const latePaymentScenarios: LatePaymentScenario[] = LATE_SCENARIO_DAYS.map((days) => {
    const scenarioPenalty = calcPenalty(cfg, penaltyBase, days);
    return {
      daysLate: days,
      penalty: scenarioPenalty,
      totalRevenue: round2(
        interest + initiationFee + managementFee + scenarioPenalty,
        cfg.roundingMode,
      ),
    };
  });

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
  };
}
