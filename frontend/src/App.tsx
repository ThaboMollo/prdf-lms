import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from './app/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { CardSkeleton } from './components/shared/Skeletons'
import { ApplicationsPage } from './pages/ApplicationsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { LoanDetailsPage } from './pages/LoanDetailsPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { RegisterPage } from './pages/RegisterPage'
import { fetchMe } from './lib/api'
import { supabase } from './lib/supabase'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setLoadingSession(false)
      }
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: () => fetchMe(session?.access_token ?? ''),
    enabled: Boolean(session?.access_token)
  })

  if (loadingSession) {
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <CardSkeleton />
        </div>
      </main>
    )
  }

  const protectedReady = Boolean(session && meQuery.data)

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth session={session} />}>
        {protectedReady ? (
          <Route element={<AppShell session={session as Session} me={meQuery.data!} />}>
            <Route path="/dashboard" element={<DashboardPage session={session as Session} me={meQuery.data!} />} />
            <Route path="/applications" element={<ApplicationsPage session={session as Session} me={meQuery.data!} />} />
            <Route element={<RequireRole me={meQuery.data!} allowed={['Originator', 'LoanOfficer', 'Admin']} />}>
              <Route path="/loans" element={<LoanDetailsPage session={session as Session} />} />
            </Route>
            <Route element={<RequireRole me={meQuery.data!} allowed={['LoanOfficer', 'Admin']} />}>
              <Route path="/portfolio" element={<PortfolioPage session={session as Session} />} />
            </Route>
          </Route>
        ) : (
          <Route
            path="*"
            element={
              <main className="auth-wrap">
                <div className="auth-card">
                  {meQuery.isError ? <p>Could not load your profile. Refresh to retry.</p> : <CardSkeleton />}
                </div>
              </main>
            }
          />
        )}
      </Route>
      <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}
