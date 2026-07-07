/**
 * Loan calculation utilities.
 *
 * These figures are indicative only. PRDF's user-facing lending-rate rule is
 * Prime+, up to P+10 based on the quality of the transaction; final pricing is
 * confirmed during assessment.
 */

const BASE_ESTIMATE_RATE = 0.03
const MONTHLY_ESTIMATE_RATE = 0.02

/**
 * Indicative finance charge used only for pre-assessment estimates.
 */
export function calculateTotalFees(amount: number, term: number): number {
  const baseEstimate = amount * BASE_ESTIMATE_RATE
  const monthlyEstimate = amount * MONTHLY_ESTIMATE_RATE * term
  return Math.round(baseEstimate + monthlyEstimate)
}

/**
 * Indicative repayment = principal + estimated finance charge.
 */
export function calculateTotalRepayment(amount: number, term: number): number {
  return amount + calculateTotalFees(amount, term)
}

/**
 * Monthly instalment (total repayment split over term months).
 */
export function calculateMonthlyInstalment(amount: number, term: number): number {
  if (term <= 0) return 0
  return Math.round(calculateTotalRepayment(amount, term) / term)
}

/**
 * Format a number as South African Rand.
 */
export function formatRand(value: number): string {
  return `R ${value.toLocaleString('en-ZA').replace(/ /g, ' ')}`
}
