import { createLoansRepository } from '../../../lib/data/repositories/loans.repo'

export function createLoansUseCases(accessToken: string) {
  const repository = createLoansRepository(accessToken)

  return {
    getLoan: (loanId: string) => repository.getLoan(loanId),
    disburseLoan: (loanId: string, amount: number, reference?: string) => repository.disburseLoan(loanId, amount, reference),
    recordRepayment: (loanId: string, amount: number, paymentReference?: string, paidAt?: string) =>
      repository.recordRepayment(loanId, amount, paymentReference, paidAt)
  }
}
