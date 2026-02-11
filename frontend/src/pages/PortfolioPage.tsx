import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { getArrears, getPortfolioSummary, type ArrearsItem } from '../lib/api'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { formatCurrency } from '../lib/format'

type PortfolioPageProps = {
  session: Session
}

function toArrearsCsv(items: ArrearsItem[]): string {
  const headers = ['loanId', 'applicationId', 'installmentNo', 'dueDate', 'dueTotal', 'paidAmount', 'outstandingAmount', 'daysOverdue']
  const rows = items.map((item) =>
    [
      item.loanId,
      item.applicationId,
      String(item.installmentNo),
      item.dueDate,
      item.dueTotal.toFixed(2),
      item.paidAmount.toFixed(2),
      item.outstandingAmount.toFixed(2),
      String(item.daysOverdue)
    ].join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

export function PortfolioPage({ session }: PortfolioPageProps) {
  const accessToken = session.access_token

  const summaryQuery = useQuery({
    queryKey: ['portfolio-summary', session.user.id],
    queryFn: () => getPortfolioSummary(accessToken)
  })

  const arrearsQuery = useQuery({
    queryKey: ['portfolio-arrears', session.user.id],
    queryFn: () => getArrears(accessToken)
  })

  const csvHref = useMemo(() => {
    if (!arrearsQuery.data) return null
    const csv = toArrearsCsv(arrearsQuery.data)
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
  }, [arrearsQuery.data])

  return (
    <section className="stack">
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="Monitor portfolio health, exposure, and overdue installments."
        actions={csvHref ? <a href={csvHref} className="btn" download="arrears-report.csv">Export CSV</a> : null}
      />

      {summaryQuery.data ? (
        <div className="grid-three">
          <article className="kpi-card"><p className="kpi-label">Total Loans</p><p className="kpi-value">{summaryQuery.data.totalLoans}</p></article>
          <article className="kpi-card"><p className="kpi-label">Active Loans</p><p className="kpi-value">{summaryQuery.data.activeLoans}</p></article>
          <article className="kpi-card"><p className="kpi-label">Outstanding</p><p className="kpi-value">{formatCurrency(summaryQuery.data.outstandingPrincipal)}</p></article>
        </div>
      ) : null}

      <div className="card table-wrap">
        <h2>Arrears</h2>
        {arrearsQuery.data?.length ? (
          <table>
            <thead>
              <tr><th>Loan ID</th><th>Application ID</th><th>Installment</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Outstanding</th><th>Days</th></tr>
            </thead>
            <tbody>
              {arrearsQuery.data.map((row) => (
                <tr key={`${row.loanId}-${row.installmentNo}`}>
                  <td>{row.loanId}</td>
                  <td>{row.applicationId}</td>
                  <td>{row.installmentNo}</td>
                  <td>{row.dueDate}</td>
                  <td>{formatCurrency(row.dueTotal)}</td>
                  <td>{formatCurrency(row.paidAmount)}</td>
                  <td>{formatCurrency(row.outstandingAmount)}</td>
                  <td>{row.daysOverdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No overdue installments" message="All tracked installments are current." />
        )}
      </div>
    </section>
  )
}
