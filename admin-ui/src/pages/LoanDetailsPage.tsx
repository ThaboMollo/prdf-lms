import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { PaginationControls } from '../components/shared/PaginationControls'
import { formatCurrency, formatDateTime } from '../lib/format'
import { paginateItems, parsePageParam } from '../lib/pagination'
import { createLoansUseCases } from '../logic/usecases/loans'

type LoanDetailsPageProps = {
  session: Session
}

const SCHEDULE_PAGE_SIZE = 12
const REPAYMENTS_PAGE_SIZE = 12

export function LoanDetailsPage({ session }: LoanDetailsPageProps) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const accessToken = session.access_token
  const loansUseCases = useMemo(() => createLoansUseCases(accessToken), [accessToken])
  const [loanId, setLoanId] = useState('')
  const [submittedLoanId, setSubmittedLoanId] = useState('')
  const [disburseAmount, setDisburseAmount] = useState(0)
  const [disburseReference, setDisburseReference] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState(0)
  const [repaymentReference, setRepaymentReference] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const schedulePage = parsePageParam(params.get('schedulePage'))
  const repaymentsPage = parsePageParam(params.get('repaymentsPage'))

  const loanQuery = useQuery({
    queryKey: ['loan-details', submittedLoanId],
    queryFn: () => loansUseCases.getLoan(submittedLoanId),
    enabled: Boolean(submittedLoanId)
  })

  const disburseMutation = useMutation({
    mutationFn: () => loansUseCases.disburseLoan(submittedLoanId, disburseAmount, disburseReference),
    onSuccess: async () => {
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['loan-details', submittedLoanId] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Could not disburse loan.')
    }
  })

  const repaymentMutation = useMutation({
    mutationFn: () => loansUseCases.recordRepayment(submittedLoanId, repaymentAmount, repaymentReference),
    onSuccess: async () => {
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['loan-details', submittedLoanId] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Could not record repayment.')
    }
  })

  const totalDue = useMemo(() => loanQuery.data?.schedule.reduce((sum, item) => sum + item.dueTotal, 0) ?? 0, [loanQuery.data])

  const pagedSchedule = useMemo(
    () => paginateItems(loanQuery.data?.schedule ?? [], schedulePage, SCHEDULE_PAGE_SIZE),
    [loanQuery.data?.schedule, schedulePage]
  )

  const pagedRepayments = useMemo(
    () => paginateItems(loanQuery.data?.repayments ?? [], repaymentsPage, REPAYMENTS_PAGE_SIZE),
    [loanQuery.data?.repayments, repaymentsPage]
  )

  return (
    <section className="stack">
      <PageHeader title="Loan Details" subtitle="Load a loan record to manage disbursements and repayments." />

      <div className="card form-grid">
        <label>
          Loan ID
          <input placeholder="Loan ID (UUID)" value={loanId} onChange={(e) => setLoanId(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setFormError(null)
            setSubmittedLoanId(loanId.trim())
          }}
          disabled={!loanId.trim()}
        >
          Load Loan
        </button>
      </div>

      {loanQuery.isError ? <p className="text-error">Unable to load loan details.</p> : null}
      {formError ? <p className="text-error">{formError}</p> : null}

      {loanQuery.data ? (
        <>
          <div className="grid-three">
            <article className="kpi-card"><p className="kpi-label">Status</p><p className="kpi-value">{loanQuery.data.status}</p></article>
            <article className="kpi-card"><p className="kpi-label">Outstanding</p><p className="kpi-value">{formatCurrency(loanQuery.data.outstandingPrincipal)}</p></article>
            <article className="kpi-card"><p className="kpi-label">Scheduled Due</p><p className="kpi-value">{formatCurrency(totalDue)}</p></article>
          </div>

          <div className="grid-two">
            <article className="card form-grid">
              <h2>Disburse Loan</h2>
              <label>
                Amount
                <input type="number" value={disburseAmount} onChange={(e) => setDisburseAmount(Number(e.target.value))} />
              </label>
              <label>
                Reference
                <input value={disburseReference} onChange={(e) => setDisburseReference(e.target.value)} />
              </label>
              <button className="btn" type="button" onClick={() => disburseMutation.mutate()} disabled={disburseMutation.isPending || disburseAmount <= 0}>
                {disburseMutation.isPending ? 'Disbursing...' : 'Disburse'}
              </button>
            </article>

            <article className="card form-grid">
              <h2>Record Repayment</h2>
              <label>
                Amount
                <input type="number" value={repaymentAmount} onChange={(e) => setRepaymentAmount(Number(e.target.value))} />
              </label>
              <label>
                Payment reference
                <input value={repaymentReference} onChange={(e) => setRepaymentReference(e.target.value)} />
              </label>
              <button className="btn" type="button" onClick={() => repaymentMutation.mutate()} disabled={repaymentMutation.isPending || repaymentAmount <= 0}>
                {repaymentMutation.isPending ? 'Recording...' : 'Record'}
              </button>
            </article>
          </div>

          <div className="card table-wrap">
            <h2>Repayment Schedule</h2>
            {loanQuery.data.schedule.length ? (
              <>
                <table>
                  <thead><tr><th>#</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {pagedSchedule.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.installmentNo}</td>
                        <td>{item.dueDate}</td>
                        <td>{formatCurrency(item.dueTotal)}</td>
                        <td>{formatCurrency(item.paidAmount)}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls
                  page={pagedSchedule.page}
                  totalPages={pagedSchedule.totalPages}
                  onPageChange={(nextPage) => {
                    const next = new URLSearchParams(params)
                    next.set('schedulePage', String(nextPage))
                    setParams(next)
                  }}
                />
              </>
            ) : <EmptyState title="No schedule" message="No repayment schedule generated yet." />}
          </div>

          <div className="card table-wrap">
            <h2>Repayments</h2>
            {loanQuery.data.repayments.length ? (
              <>
                <table>
                  <thead><tr><th>Date</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Reference</th></tr></thead>
                  <tbody>
                    {pagedRepayments.items.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.paidAt)}</td>
                        <td>{formatCurrency(item.amount)}</td>
                        <td>{formatCurrency(item.principalComponent)}</td>
                        <td>{formatCurrency(item.interestComponent)}</td>
                        <td>{item.paymentReference ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls
                  page={pagedRepayments.page}
                  totalPages={pagedRepayments.totalPages}
                  onPageChange={(nextPage) => {
                    const next = new URLSearchParams(params)
                    next.set('repaymentsPage', String(nextPage))
                    setParams(next)
                  }}
                />
              </>
            ) : <EmptyState title="No repayments" message="No repayments have been posted yet." />}
          </div>
        </>
      ) : null}
    </section>
  )
}
