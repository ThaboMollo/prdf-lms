import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { listLoans } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'

type LoansPageProps = {
  session: Session
}

// ADM-061: the loan list, backed by GET /api/loans (ADM-060). Rows open the
// loan inside its case (Money tab).
export function LoansPage({ session }: LoansPageProps) {
  const accessToken = session.access_token
  const loansQuery = useQuery({
    queryKey: ['loans', session.user.id],
    queryFn: () => listLoans(accessToken)
  })

  const loans = loansQuery.data ?? []

  return (
    <section className="stack">
      <PageHeader title="Loans" subtitle="Active and closed loans across the book." />

      <div className="card table-wrap">
        {loansQuery.isLoading ? <ListSkeleton rows={8} /> : null}

        {loansQuery.isError ? (
          <div className="stack-sm" role="alert">
            <p className="text-error">Could not load loans.</p>
            <button className="btn btn-secondary" type="button" onClick={() => void loansQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        {!loansQuery.isLoading && !loansQuery.isError && !loans.length ? (
          <EmptyState title="No loans yet" message="Loans appear here once applications are approved and disbursed." />
        ) : null}

        {!loansQuery.isError && loans.length ? (
          <table>
            <thead>
              <tr>
                <th>Loan</th>
                <th>Business</th>
                <th>Principal</th>
                <th>Outstanding</th>
                <th>Disbursed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td>
                    <Link to={`/case/${loan.applicationId}?tab=money`} className="entity-link">
                      <span className="entity-id">#{loan.id.slice(0, 8)}</span>
                    </Link>
                  </td>
                  <td>{loan.businessName ?? '—'}</td>
                  <td>{formatCurrency(loan.principalAmount)}</td>
                  <td>{formatCurrency(loan.outstandingPrincipal)}</td>
                  <td>{loan.disbursedAt ? formatDate(loan.disbursedAt) : '—'}</td>
                  <td><StatusBadge status={loan.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  )
}
