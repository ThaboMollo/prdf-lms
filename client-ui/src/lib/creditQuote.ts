/**
 * Client-portal adapter over the shared credit-model engine
 * (packages/domain/pricing.ts) — the same pure functions backend-node's
 * POST /api/pricing/quote and the admin case page run on.
 *
 * This replaces loanCalc.ts's monthly-amortising approximation for everything
 * the applicant is shown a price with. loanCalc.ts stays as-is: it is a
 * hand-synced sibling of backend-node's interest.ts and admin-ui's copy, and
 * buildRepaymentSchedule still drives real booked loans until Phase 2 swaps
 * them to bullet-at-maturity. Nothing credit-model-specific belongs in it.
 *
 * Lives in client-ui rather than packages/ because admin-ui deliberately goes
 * through the authenticated API for quotes (it needs the real risk grade);
 * only the public portal computes locally.
 */
import { quote, type PricingConfig, type QuoteBreakdown } from '../../../packages/domain/pricing'
import type { PublicPricingConfig } from '../../../packages/client-core/usePricingConfig'

/**
 * Months → days financed.
 *
 * The credit model is driven by Days Financed; the portal collects a term in
 * months (loan_products and loan_applications.term_months both store months,
 * and reconciling the two units is Phase 2 work). A calendar month —
 * daysPerYear / 12 — is the conversion that keeps a stated "12 months" worth
 * exactly one year of interest at the annual rate, and it lands on the
 * spreadsheet's Short-Term rows exactly: 12mo = 365d, 24mo = 730d, 36mo = 1095d.
 *
 * Known divergence: the sheet also models 90d and 180d as "3 months" and
 * "6 months" (30-day months), where this gives 91 and 183. Interest is ~1%
 * higher on those two rows. A 30-day month would invert the problem, making a
 * 12-month loan 360 days and under-charging a full year — the worse error on
 * an indicative quote, since the rate is advertised per annum.
 */
export function monthsToDays(months: number, daysPerYear: number): number {
  return Math.round(months * (daysPerYear / 12))
}

export type IndicativeQuote = QuoteBreakdown & {
  daysFinanced: number
  /** Principal + interest + initiation + management. The full cost of credit. */
  totalRepayable: number
  /**
   * Principal + interest, fees excluded — the hero's "indicative total
   * repayment". The hero deliberately quotes capital and interest only; the
   * apply wizard's cost card is where the once-off fees are itemised, so the
   * two panels are never on screen together showing different totals.
   */
  totalRepaymentExclFees: number
  /**
   * totalRepaymentExclFees spread evenly over the term.
   *
   * Not an amortisation schedule: the credit model prices a bullet loan (simple
   * daily interest on the full principal, settled at maturity), so there is no
   * declining balance to amortise. This is the straight division the client's
   * mockup uses — instalment x months reconciles exactly to the total beside it.
   */
  monthlyInstalment: number
}

/**
 * Indicative, best-case quote: priced at the cheapest active risk grade with no
 * penalty, since a public applicant has not been graded yet. The real grade is
 * set by the Risk Analyst at Due Diligence and can only raise the rate — hence
 * the "from" framing everywhere this is displayed.
 */
export function indicativeQuote(
  config: PublicPricingConfig,
  principal: number,
  termMonths: number,
): IndicativeQuote {
  const daysFinanced = monthsToDays(termMonths, config.daysPerYear)
  const breakdown = quote(config as PricingConfig, {
    principal,
    daysFinanced,
    riskGrade: config.indicativeGrade,
    marginPct: config.indicativeMarginPct,
    daysLate: 0,
  })

  // totalDueToFunder is already principal + interest, rounded by the engine.
  const totalRepaymentExclFees = breakdown.totalDueToFunder
  const months = termMonths > 0 ? termMonths : 1

  return {
    ...breakdown,
    daysFinanced,
    totalRepayable: breakdown.totalDueToFunder + breakdown.totalFees,
    totalRepaymentExclFees,
    monthlyInstalment: Math.round((totalRepaymentExclFees / months) * 100) / 100,
  }
}

/** "15.50% p.a." — the indicative annual rate, framed as a floor. */
export function formatIndicativeRate(config: PublicPricingConfig): string {
  return `From ${config.indicativeAnnualRatePct.toFixed(2)}% p.a.`
}

/**
 * "Prime + up to 10.50%" — the headline rate disclosure.
 *
 * Expressed as a margin over Prime rather than a flat percentage because Prime
 * moves: the statement stays true after a repo-rate change, and it names the
 * benchmark the applicant can verify independently. The figure is the dearest
 * active margin, so it is a genuine ceiling, not a typical case.
 */
export function formatRateCeiling(config: PublicPricingConfig): string {
  return `Prime + up to ${config.maxMarginPct.toFixed(2)}%`
}
