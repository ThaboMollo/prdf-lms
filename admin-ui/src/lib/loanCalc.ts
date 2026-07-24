/**
 * Loan calculation utilities — pure math only. The annual rate is always
 * supplied by the caller (from `useActiveLoanProduct()`, see loanProduct.ts)
 * rather than defaulting to a hardcoded constant here.
 *
 * Interest is simple monthly interest on the outstanding principal:
 * monthly rate = annual rate / 12.
 *
 * loans.interest_rate stores the annual percentage rate, sourced from
 * loan_products at approval time.
 */

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** Monthly rate as a fraction of the annual percentage rate (annual / 100 / 12). */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12
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
