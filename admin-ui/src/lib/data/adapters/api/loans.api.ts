import { disburseLoan, getLoan, recordRepayment } from '../../../api'
import type { LoansRepository } from '../../repositories/loans.repo'

export function createApiLoansAdapter(accessToken: string): LoansRepository {
  return {
    getLoan: (loanId: string) => getLoan(accessToken, loanId),
    disburseLoan: (loanId: string, amount: number, reference?: string) =>
      disburseLoan(accessToken, loanId, amount, reference),
    recordRepayment: (loanId: string, amount: number, paymentReference?: string, paidAt?: string) =>
      recordRepayment(accessToken, loanId, amount, paymentReference, paidAt)
  }
}
