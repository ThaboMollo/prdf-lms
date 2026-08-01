import { useMemo } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { createLoansUseCases } from '../logic/usecases/loans'

// ADM-041: the loan now lives inside its case (Money tab). Old /loan/:loanId
// links resolve the loan's application and redirect, so bookmarks survive.
export function LoanRedirect({ session }: { session: Session }) {
  const { loanId } = useParams<{ loanId: string }>()
  const loansUseCases = useMemo(() => createLoansUseCases(session.access_token), [session.access_token])

  const loanQuery = useQuery({
    queryKey: ['loan-redirect', loanId],
    queryFn: () => loansUseCases.getLoan(loanId as string),
    enabled: Boolean(loanId)
  })

  if (loanQuery.data) {
    return <Navigate to={`/case/${loanQuery.data.applicationId}?tab=money`} replace />
  }

  if (loanQuery.isError) {
    return (
      <section className="stack">
        <EmptyState title="Loan not found" message="This loan could not be opened. It may have moved into its case." />
      </section>
    )
  }

  return <p>Opening loan…</p>
}
