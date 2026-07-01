import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { createLoansUseCases } from '../logic/usecases/loans'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { StatusBadge } from '../components/shared/StatusBadge'
import { CardSkeleton } from '../components/shared/Skeletons'
import { formatCurrency, formatDate } from '../lib/format'

type LoansPageProps = {
  session: Session
}

export function LoansPage({ session }: LoansPageProps) {
  const accessToken = session.access_token
  const loansUseCases = useMemo(() => createLoansUseCases(accessToken), [accessToken])

  const loansQuery = useQuery({
    queryKey: ['my-loans', session.user.id],
    queryFn: () => loansUseCases.listMyLoans()
  })

  return (
    <section className="stack">
      <PageHeader title="My Loans" subtitle="View your disbursed loans, repayment schedule, and balance." />

      {loansQuery.isLoading ? (
        <CardSkeleton />
      ) : loansQuery.isError ? (
        <EmptyState
          title="Unable to load your loans"
          message="We couldn't load your loans right now. Please retry."
          ctaLabel="Retry"
          onCtaClick={() => loansQuery.refetch()}
        />
      ) : loansQuery.data && loansQuery.data.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Status</th><th>Principal</th><th>Outstanding</th><th>Term</th><th>Disbursed</th><th /></tr>
            </thead>
            <tbody>
              {loansQuery.data.map((loan) => (
                <tr key={loan.id}>
                  <td><StatusBadge status={loan.status} /></td>
                  <td>{formatCurrency(loan.principalAmount)}</td>
                  <td>{formatCurrency(loan.outstandingPrincipal)}</td>
                  <td>{loan.termMonths} months</td>
                  <td>{loan.disbursedAt ? formatDate(loan.disbursedAt) : '-'}</td>
                  <td><Link className="link-btn" to={`/loans/${loan.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No loans yet"
          message="Once your application is approved and disbursed, your loan and repayment schedule will appear here."
        />
      )}
    </section>
  )
}
