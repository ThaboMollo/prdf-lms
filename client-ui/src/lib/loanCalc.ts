/**
 * Loan calculation utilities.
 *
 * PRDF pricing is Prime-linked: annual rate = prime + margin, up to P+10
 * based on the quality of the transaction; final pricing is confirmed during
 * assessment. Interest is simple monthly interest on the outstanding
 * principal: monthly rate = annual rate / 12.
 *
 * Example — R1 000 000 over 1 month at P+10 (prime 10.50%):
 *   annual 20.50% -> monthly 1.708333% -> interest R17 083.33,
 *   total repayment R1 017 083.33.
 *
 * Keep in sync with backend-node/src/common/interest.ts and
 * admin-ui/src/lib/loanCalc.ts.
 */

/** South African prime lending rate (% per annum). */
export const PRIME_RATE_PA = 10.5

/** Default pricing margin over prime (% per annum). */
export const DEFAULT_MARGIN_PA = 10

/** Default annual lending rate (% per annum): Prime + 10 = 20.50%. */
export const DEFAULT_ANNUAL_RATE_PA = PRIME_RATE_PA + DEFAULT_MARGIN_PA

/** Human-readable default rate, e.g. "Up to 20.50% p.a. (Prime + 10%)" */
export const DEFAULT_RATE_LABEL = `Up to ${DEFAULT_ANNUAL_RATE_PA.toFixed(2)}% p.a. (Prime + ${DEFAULT_MARGIN_PA}%)`

/** Monthly rate as a fraction, e.g. 20.5 -> 0.0170833. */
export function monthlyRate(annualRatePct: number = DEFAULT_ANNUAL_RATE_PA): number {
  return annualRatePct / 100 / 12
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

export type ScheduleInstallment = {
  installmentNo: number
  openingBalance: number
  principal: number
  interest: number
  total: number
  closingBalance: number
}

/**
 * Build a repayment schedule: equal monthly principal portions, with
 * interest charged on the outstanding balance at the start of each month.
 */
export function buildInstallments(
  amount: number,
  termMonths: number,
  annualRatePct: number = DEFAULT_ANNUAL_RATE_PA,
): ScheduleInstallment[] {
  if (amount <= 0 || termMonths <= 0) return []
  const rate = monthlyRate(annualRatePct)
  const principalPortion = roundCents(amount / termMonths)
  const rows: ScheduleInstallment[] = []
  let balance = amount
  for (let i = 1; i <= termMonths; i++) {
    const principal = i === termMonths ? balance : principalPortion
    const interest = roundCents(balance * rate)
    const closing = roundCents(balance - principal)
    rows.push({
      installmentNo: i,
      openingBalance: balance,
      principal,
      interest,
      total: roundCents(principal + interest),
      closingBalance: closing,
    })
    balance = closing
  }
  return rows
}

/** Total interest payable over the full term. */
export function calculateTotalInterest(
  amount: number,
  term: number,
  annualRatePct: number = DEFAULT_ANNUAL_RATE_PA,
): number {
  return roundCents(buildInstallments(amount, term, annualRatePct).reduce((sum, r) => sum + r.interest, 0))
}

/** Total repayment = principal + total interest. */
export function calculateTotalRepayment(
  amount: number,
  term: number,
  annualRatePct: number = DEFAULT_ANNUAL_RATE_PA,
): number {
  return roundCents(amount + calculateTotalInterest(amount, term, annualRatePct))
}

/**
 * First month's instalment (the highest — instalments decline as the
 * balance reduces).
 */
export function calculateMonthlyInstalment(
  amount: number,
  term: number,
  annualRatePct: number = DEFAULT_ANNUAL_RATE_PA,
): number {
  const [first] = buildInstallments(amount, term, annualRatePct)
  return first?.total ?? 0
}

/**
 * Format a number as South African Rand (cents shown only when present).
 */
export function formatRand(value: number): string {
  const formatted = value.toLocaleString('en-ZA', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `R ${formatted.replace(/ /g, ' ')}`
}
