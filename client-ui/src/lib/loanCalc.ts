/**
 * Loan calculation utilities — pure math only. The annual rate is always
 * supplied by the caller (from `useActiveLoanProduct()`, see loanProduct.ts)
 * rather than defaulting to a hardcoded constant here.
 *
 * Interest is simple monthly interest on the outstanding principal:
 * monthly rate = annual rate / 12.
 */

/** Monthly rate as a fraction of the annual percentage rate (annual / 100 / 12). */
export function monthlyRate(annualRatePct: number): number {
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
  annualRatePct: number,
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
export function calculateTotalInterest(amount: number, term: number, annualRatePct: number): number {
  return roundCents(buildInstallments(amount, term, annualRatePct).reduce((sum, r) => sum + r.interest, 0))
}

/** Total repayment = principal + total interest. */
export function calculateTotalRepayment(amount: number, term: number, annualRatePct: number): number {
  return roundCents(amount + calculateTotalInterest(amount, term, annualRatePct))
}

/**
 * First month's instalment (the highest — instalments decline as the
 * balance reduces).
 */
export function calculateMonthlyInstalment(amount: number, term: number, annualRatePct: number): number {
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
