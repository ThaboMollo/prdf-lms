import type { LoanDetails } from '../../api'
import { createSupabaseLoansAdapter } from '../adapters/supabase/loans.supabase'

export type LoansRepository = {
  getLoan: (loanId: string) => Promise<LoanDetails>
  disburseLoan: (loanId: string, amount: number, reference?: string) => Promise<LoanDetails>
  recordRepayment: (loanId: string, amount: number, paymentReference?: string, paidAt?: string) => Promise<LoanDetails>
}

export function createLoansRepository(accessToken: string): LoansRepository {
  return createSupabaseLoansAdapter(accessToken)
}
