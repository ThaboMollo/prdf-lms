import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LoanApplicationStatus } from '../lib/api'
import { createApplicationsUseCases } from '../logic/usecases/applications'
 

type RequireClientProgressProps = {
  session: Session
}

const submittedStatuses: LoanApplicationStatus[] = [
  'Submitted',
  'UnderReview',
  'InfoRequested',
  'Approved',
  'Rejected',
  'Disbursed',
  'InRepayment',
  'Closed'
]

export function RequireClientProgress({ session }: RequireClientProgressProps) {
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const appsQuery = useQuery({
    queryKey: ['progress-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  if (appsQuery.isLoading) {
    return null
  }

  const apps = appsQuery.data ?? []
  const hasSubmitted = apps.some((app) => submittedStatuses.includes(app.status))

  if (!hasSubmitted) {
    return <Navigate to="/apply" replace />
  }

  return <Outlet />
}
