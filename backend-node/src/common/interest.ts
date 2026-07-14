// PRDF lending-rate model. Keep in sync with client-ui/src/lib/loanCalc.ts
// and admin-ui/src/lib/loanCalc.ts.
//
// Pricing is Prime-linked: annual rate = prime + margin, up to P+8 based on
// the quality of the transaction. Interest is simple monthly interest on the
// outstanding principal: monthly rate = annual rate / 12.
//
// Example — R1 000 000 over 1 month at P+8 (prime 10.50%):
//   annual 18.50% -> monthly 1.541667% -> interest R15 416.67,
//   total repayment R1 015 416.67.
//
// loans.interest_rate stores the annual percentage rate (e.g. 18.500).

export const PRIME_RATE_PA = 10.5;
export const DEFAULT_MARGIN_PA = 8;
export const DEFAULT_ANNUAL_RATE_PA = PRIME_RATE_PA + DEFAULT_MARGIN_PA;

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Monthly rate as a fraction, e.g. 18.5 -> 0.0154167. */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/** One month's interest on an outstanding balance. */
export function monthlyInterest(balance: number, annualRatePct: number): number {
  return roundCents(balance * monthlyRate(annualRatePct));
}
