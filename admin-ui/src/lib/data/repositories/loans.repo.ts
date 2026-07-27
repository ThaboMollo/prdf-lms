import type { LoanDetails } from '../../api'
import { createApiLoansAdapter } from '../adapters/api/loans.api'

export type LoansRepository = {
  getLoan: (loanId: string) => Promise<LoanDetails>
  disburseLoan: (loanId: string, amount: number, reference?: string) => Promise<LoanDetails>
  recordRepayment: (loanId: string, amount: number, paymentReference?: string, paidAt?: string) => Promise<LoanDetails>
}

export function createLoansRepository(accessToken: string): LoansRepository {
  return createApiLoansAdapter(accessToken)
}
