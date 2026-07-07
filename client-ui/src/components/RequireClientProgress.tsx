import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createApplicationsUseCases } from '../logic/usecases/applications'


type RequireClientProgressProps = {
  session: Session
}

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
  // Any application — including a saved draft — counts as progress, so draft-only
  // clients can reach the dashboard/status pages to resume it. Only brand-new
  // clients (no applications at all) are routed straight into the apply wizard.
  if (apps.length === 0) {
    return <Navigate to="/apply" replace />
  }

  return <Outlet />
}
