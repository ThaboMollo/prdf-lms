import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { createLoansUseCases } from '../logic/usecases/loans'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { StatusBadge } from '../components/shared/StatusBadge'
import { formatCurrency, formatDateTime } from '../lib/format'

type LoanDetailsPageProps = {
  session: Session
}

export function LoanDetailsPage({ session }: LoanDetailsPageProps) {
  const accessToken = session.access_token
  const loansUseCases = useMemo(() => createLoansUseCases(accessToken), [accessToken])
  const [loanId, setLoanId] = useState('')
  const [submittedLoanId, setSubmittedLoanId] = useState('')

  const loanQuery = useQuery({
    queryKey: ['loan-details', submittedLoanId],
    queryFn: () => loansUseCases.getLoan(submittedLoanId),
    enabled: Boolean(submittedLoanId)
  })

  const totalDue = useMemo(() => loanQuery.data?.schedule.reduce((sum, item) => sum + item.dueTotal, 0) ?? 0, [loanQuery.data])
  const totalPaid = useMemo(() => loanQuery.data?.repayments.reduce((sum, item) => sum + item.amount, 0) ?? 0, [loanQuery.data])

  return (
    <section className="stack">
      <PageHeader title="Loan Account" subtitle="View loan status, repayment schedule, and repayment history." />

      <div className="card form-grid">
        <label>
          Loan ID
          <input placeholder="Loan ID" value={loanId} onChange={(e) => setLoanId(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => setSubmittedLoanId(loanId.trim())}
          disabled={!loanId.trim()}
        >
          Load Loan
        </button>
      </div>

      {loanQuery.isError ? (
        <EmptyState
          title="Unable to load loan"
          message="This loan account could not be loaded. Check the loan ID and retry."
          ctaLabel="Retry"
          onCtaClick={() => loanQuery.refetch()}
        />
      ) : null}

      {loanQuery.data ? (
        <>
          <div className="grid-three">
            <article className="kpi-card">
              <p className="kpi-label">Status</p>
              <p className="kpi-value"><StatusBadge status={loanQuery.data.status} /></p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Outstanding</p>
              <p className="kpi-value">{formatCurrency(loanQuery.data.outstandingPrincipal)}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Scheduled Due</p>
              <p className="kpi-value">{formatCurrency(totalDue)}</p>
            </article>
          </div>

          <div className="grid-three">
            <article className="kpi-card">
              <p className="kpi-label">Principal</p>
              <p className="kpi-value">{formatCurrency(loanQuery.data.principalAmount)}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Term</p>
              <p className="kpi-value">{loanQuery.data.termMonths} months</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Paid</p>
              <p className="kpi-value">{formatCurrency(totalPaid)}</p>
            </article>
          </div>

          <div className="card table-wrap">
            <h2>Repayment Schedule</h2>
            {loanQuery.data.schedule.length ? (
              <table>
                <thead><tr><th>#</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
                <tbody>
                  {loanQuery.data.schedule.map((item) => (
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
            ) : <EmptyState title="No schedule" message="No repayment schedule has been generated yet." />}
          </div>

          <div className="card table-wrap">
            <h2>Repayments</h2>
            {loanQuery.data.repayments.length ? (
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Reference</th></tr></thead>
                <tbody>
                  {loanQuery.data.repayments.map((item) => (
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
            ) : <EmptyState title="No repayments" message="No repayments have been posted yet." />}
          </div>
        </>
      ) : null}
    </section>
  )
}
