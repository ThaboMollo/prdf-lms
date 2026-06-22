/**
 * Loan calculation utilities.
 * Uses a simple flat-fee model: 3% origination fee + 2% monthly service fee.
 * Adjust ORIGINATION_RATE and MONTHLY_RATE to match PRDF's actual product rates.
 */

const ORIGINATION_RATE = 0.03   // 3% once-off origination fee
const MONTHLY_RATE = 0.02       // 2% per month flat rate

/**
 * Total fees (origination + monthly service fees).
 */
export function calculateTotalFees(amount: number, term: number): number {
  const originationFee = amount * ORIGINATION_RATE
  const monthlyFees = amount * MONTHLY_RATE * term
  return Math.round(originationFee + monthlyFees)
}

/**
 * Total repayment = principal + all fees.
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
