import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { getArrears, getPortfolioSummary, type ArrearsItem } from '../lib/api'

type PortfolioPageProps = {
  session: Session | null
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
  const accessToken = session?.access_token ?? ''

  const summaryQuery = useQuery({
    queryKey: ['portfolio-summary', session?.user.id],
    queryFn: () => getPortfolioSummary(accessToken),
    enabled: Boolean(accessToken)
  })

  const arrearsQuery = useQuery({
    queryKey: ['portfolio-arrears', session?.user.id],
    queryFn: () => getArrears(accessToken),
    enabled: Boolean(accessToken)
  })

  const csvHref = useMemo(() => {
    if (!arrearsQuery.data) {
      return null
    }
    const csv = toArrearsCsv(arrearsQuery.data)
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
  }, [arrearsQuery.data])

  if (!accessToken) {
    return <p>Please log in to continue.</p>
  }

  return (
    <section>
      <h1>Portfolio Dashboard</h1>

      {summaryQuery.isLoading ? <p>Loading portfolio summary...</p> : null}
      {summaryQuery.isError ? <p style={{ color: 'crimson' }}>Unable to load portfolio summary.</p> : null}
      {summaryQuery.data ? (
        <div>
          <p>Total Loans: {summaryQuery.data.totalLoans}</p>
          <p>Active Loans: {summaryQuery.data.activeLoans}</p>
          <p>Total Principal: R{summaryQuery.data.totalPrincipal.toFixed(2)}</p>
          <p>Outstanding Principal: R{summaryQuery.data.outstandingPrincipal.toFixed(2)}</p>
          <p>Repaid Principal: R{summaryQuery.data.repaidPrincipal.toFixed(2)}</p>
        </div>
      ) : null}

      <h2>Arrears</h2>
      {arrearsQuery.isLoading ? <p>Loading arrears...</p> : null}
      {arrearsQuery.isError ? <p style={{ color: 'crimson' }}>Unable to load arrears data.</p> : null}
      {arrearsQuery.data ? (
        <div>
          <a href={csvHref ?? '#'} download="arrears-report.csv" aria-disabled={!csvHref}>
            Export CSV
          </a>

          {arrearsQuery.data.length ? (
            <table>
              <thead>
                <tr>
                  <th>Loan ID</th>
                  <th>Application ID</th>
                  <th>Installment</th>
                  <th>Due Date</th>
                  <th>Due</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {arrearsQuery.data.map((row) => (
                  <tr key={`${row.loanId}-${row.installmentNo}`}>
                    <td>{row.loanId}</td>
                    <td>{row.applicationId}</td>
                    <td>{row.installmentNo}</td>
                    <td>{row.dueDate}</td>
                    <td>R{row.dueTotal.toFixed(2)}</td>
                    <td>R{row.paidAmount.toFixed(2)}</td>
                    <td>R{row.outstandingAmount.toFixed(2)}</td>
                    <td>{row.daysOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No overdue installments.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
