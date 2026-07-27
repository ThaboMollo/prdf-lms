import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from './app/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { RequireClientProgress } from './components/RequireClientProgress'
import { CardSkeleton } from './components/shared/Skeletons'
import { CalculatorProvider } from './contexts/CalculatorContext'
import { LandingPage } from './pages/LandingPage'
import { EligibilityCheckPage } from './pages/EligibilityCheckPage'
import { EligibilityResultPage } from './pages/EligibilityResultPage'
import { NotEligiblePage } from './pages/NotEligiblePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'
import { ApplyPage } from './pages/ApplyPage'
import { StatusPage } from './pages/StatusPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { LoansPage } from './pages/LoansPage'
import { LoanDetailsPage } from './pages/LoanDetailsPage'
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
    queryFn: async () => {
      if (!session) {
        throw new Error('No active session.')
      }
      return fetchMe(session.access_token)
    },
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
    <CalculatorProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage session={session} />} />
        <Route path="/eligibility" element={<EligibilityCheckPage />} />
        <Route path="/eligibility/result" element={<EligibilityResultPage />} />
        <Route path="/eligibility/not-eligible" element={<NotEligiblePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route element={<RequireAuth session={session} />}>
          {protectedReady ? (
            <Route element={<RequireRole me={meQuery.data!} allowed={['Client']} />}>
              <Route element={<AppShell session={session as Session} me={meQuery.data!} />}>
                <Route element={<RequireClientProgress session={session as Session} />}>
                  <Route path="/home" element={<HomePage session={session as Session} me={meQuery.data!} />} />
                  <Route path="/status" element={<StatusPage session={session as Session} me={meQuery.data!} />} />
                </Route>
                <Route path="/apply" element={<ApplyPage session={session as Session} me={meQuery.data!} />} />
                <Route path="/documents" element={<DocumentsPage session={session as Session} me={meQuery.data!} />} />
                <Route path="/loans" element={<LoansPage session={session as Session} />} />
                <Route path="/loans/:id" element={<LoanDetailsPage session={session as Session} />} />
                <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                <Route path="/applications" element={<Navigate to="/apply" replace />} />
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

        <Route path="*" element={<Navigate to={session ? '/home' : '/'} replace />} />
      </Routes>
    </CalculatorProvider>
  )
}
