import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { Link, useSearchParams } from 'react-router-dom'
import type { ArrearsItem } from '../lib/api'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { PaginationControls } from '../components/shared/PaginationControls'
import { formatCurrency, formatDate } from '../lib/format'
import { paginateItems, parsePageParam } from '../lib/pagination'
import { createReportsUseCases } from '../logic/usecases/reports'
import { downloadWorkbook } from '../lib/workbook'

type PortfolioPageProps = {
  session: Session
}

const ARREARS_PAGE_SIZE = 12

// Headers are Title Case here, matching the other seven reports — this one was
// the odd camelCase file out while it was CSV.
function arrearsSheet(items: ArrearsItem[]) {
  return {
    name: 'Arrears',
    columns: [
      { header: 'Loan ID', key: 'loanId', width: 38 },
      { header: 'Application ID', key: 'applicationId', width: 38 },
      { header: 'Installment No', key: 'installmentNo', format: 'integer' as const },
      { header: 'Due Date', key: 'dueDate', width: 14 },
      { header: 'Due Total', key: 'dueTotal', format: 'currency' as const },
      { header: 'Paid Amount', key: 'paidAmount', format: 'currency' as const },
      { header: 'Outstanding Amount', key: 'outstandingAmount', format: 'currency' as const, width: 20 },
      { header: 'Days Overdue', key: 'daysOverdue', format: 'integer' as const },
    ],
    rows: items.map((item) => ({
      loanId: item.loanId,
      applicationId: item.applicationId,
      installmentNo: item.installmentNo,
      dueDate: item.dueDate,
      dueTotal: item.dueTotal,
      paidAmount: item.paidAmount,
      outstandingAmount: item.outstandingAmount,
      daysOverdue: item.daysOverdue,
    })),
  }
}

export function PortfolioPage({ session }: PortfolioPageProps) {
  const [params, setParams] = useSearchParams()
  const accessToken = session.access_token
  const reportsUseCases = useMemo(() => createReportsUseCases(accessToken), [accessToken])
  const arrearsPage = parsePageParam(params.get('arrearsPage'))

  const summaryQuery = useQuery({
    queryKey: ['portfolio-summary', session.user.id],
    queryFn: () => reportsUseCases.getPortfolioSummary()
  })

  const arrearsQuery = useQuery({
    queryKey: ['portfolio-arrears', session.user.id],
    queryFn: () => reportsUseCases.getArrears()
  })

  // A binary workbook cannot ride on a `data:` URI the way the CSV string did,
  // so this is a click handler rather than a precomputed href.
  const handleExport = () => {
    if (!arrearsQuery.data) return
    void downloadWorkbook('arrears-report.xlsx', [arrearsSheet(arrearsQuery.data)])
  }


  const pagedArrears = useMemo(
    () => paginateItems(arrearsQuery.data ?? [], arrearsPage, ARREARS_PAGE_SIZE),
    [arrearsPage, arrearsQuery.data]
  )

  return (
    <section className="stack">
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="Monitor portfolio health, exposure, and overdue installments."
        actions={
          // Shown as soon as the query has resolved, empty or not — matching
          // what the CSV button did. A header-only "nothing is in arrears"
          // workbook is a legitimate thing to file, and making the control
          // vanish on a clean book reads as a broken page rather than good news.
          arrearsQuery.data
            ? <button type="button" className="btn" onClick={handleExport}>Export Excel</button>
            : null
        }
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
          <>
            <table>
              <thead>
                <tr><th>Loan ID</th><th>Application ID</th><th>Installment</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Outstanding</th><th>Days</th></tr>
              </thead>
              <tbody>
                {pagedArrears.items.map((row) => (
                  <tr key={`${row.loanId}-${row.installmentNo}`}>
                    <td>
                      <Link to={`/case/${row.applicationId}?tab=money`} className="entity-link">
                        <span className="entity-id">#{row.loanId.slice(0, 8)}</span>
                      </Link>
                    </td>
                    <td>
                      <Link to={`/case/${row.applicationId}`} className="entity-link">
                        <span className="entity-id">#{row.applicationId.slice(0, 8)}</span>
                      </Link>
                    </td>
                    <td>{row.installmentNo}</td>
                    <td>{formatDate(row.dueDate)}</td>
                    <td>{formatCurrency(row.dueTotal)}</td>
                    <td>{formatCurrency(row.paidAmount)}</td>
                    <td>{formatCurrency(row.outstandingAmount)}</td>
                    <td>{row.daysOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              page={pagedArrears.page}
              totalPages={pagedArrears.totalPages}
              onPageChange={(nextPage) => {
                const next = new URLSearchParams(params)
                next.set('arrearsPage', String(nextPage))
                setParams(next)
              }}
            />
          </>
        ) : (
          <EmptyState title="No overdue installments" message="All tracked installments are current." />
        )}
      </div>
    </section>
  )
}
