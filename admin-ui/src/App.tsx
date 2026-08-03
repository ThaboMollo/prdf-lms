import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from './app/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { CardSkeleton } from './components/shared/Skeletons'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { LoanRedirect } from './pages/LoanRedirect'
import { PortfolioPage } from './pages/PortfolioPage'
import { ReportsPage } from './pages/ReportsPage'
import { UserAccessPage } from './pages/UserAccessPage'
import { PipelinePage } from './pages/PipelinePage'
import { LoansPage } from './pages/LoansPage'
import { CasePage } from './pages/CasePage'
import { ProfilePage } from './pages/ProfilePage'
import { fetchMe } from './lib/api'
import { supabase } from './lib/supabase'
import { hasAnyRole, toAppRoles, isInternalUser } from './lib/rbac'
import { env } from './lib/config/env'
import { MfaChallenge } from './features/mfa/MfaChallenge'
import { MfaEnrolment } from './features/mfa/MfaEnrolment'
import { useMfaStatus } from './features/mfa/useMfaStatus'

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

  // Hooks must run unconditionally, so this sits above the early returns and
  // simply reports 'satisfied' until the profile has loaded.
  const appRoles = meQuery.data ? toAppRoles(meQuery.data.roles) : []
  const { state: mfaState, refresh: refreshMfa } = useMfaStatus(
    isInternalUser(appRoles),
    env.VITE_REQUIRE_MFA === 'true',
  )
  const [enrolmentDismissed, setEnrolmentDismissed] = useState(false)

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
  const onSignOut = () => {
    supabase.auth.signOut().catch(() => {})
  }

  // MFA gates sit between authentication and the routed app (spec §6.5).
  //
  // The challenge is unconditional: once an account has a verified factor,
  // an aal1 session is only half-authenticated, and the API rejects it for
  // staff when REQUIRE_MFA_FOR_STAFF is on. Enrolment is gated by
  // VITE_REQUIRE_MFA so it can be rolled out without locking anyone out.
  if (protectedReady && mfaState === 'challenge') {
    return <MfaChallenge onVerified={() => void refreshMfa()} />
  }

  if (protectedReady && mfaState === 'enrolment' && !enrolmentDismissed) {
    return (
      <MfaEnrolment
        dismissable={env.VITE_REQUIRE_MFA !== 'true'}
        onEnrolled={() => void refreshMfa()}
        onDismiss={() => setEnrolmentDismissed(true)}
      />
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth session={session} />}>
        {protectedReady ? (
          <Route
            element={
              <RequireRole
                isAllowed={hasAnyRole(toAppRoles(meQuery.data!.roles), ['Intern', 'Originator', 'LoanOfficer', 'Admin'])}
                onSignOut={onSignOut}
              />
            }
          >
            <Route element={<AppShell session={session as Session} me={meQuery.data!} />}>
              <Route path="/dashboard" element={<DashboardPage session={session as Session} me={meQuery.data!} />} />
              <Route path="/profile" element={<ProfilePage session={session as Session} me={meQuery.data!} />} />
              <Route path="/applications" element={<Navigate to="/pipeline" replace />} />
              <Route path="/pipeline" element={<PipelinePage session={session as Session} />} />
              <Route
                element={
                  <RequireRole
                    isAllowed={hasAnyRole(toAppRoles(meQuery.data!.roles), ['Originator', 'LoanOfficer', 'Admin'])}
                    onSignOut={onSignOut}
                  />
                }
              >
                <Route path="/loan/:loanId" element={<LoanRedirect session={session as Session} />} />
                <Route path="/case/:id" element={<CasePage session={session as Session} />} />
              </Route>
              <Route
                element={
                  <RequireRole
                    isAllowed={hasAnyRole(toAppRoles(meQuery.data!.roles), ['LoanOfficer', 'Admin'])}
                    onSignOut={onSignOut}
                  />
                }
              >
                <Route path="/portfolio" element={<PortfolioPage session={session as Session} />} />
                <Route path="/reports" element={<ReportsPage session={session as Session} />} />
                <Route path="/loans" element={<LoansPage session={session as Session} />} />
              </Route>
              <Route
                element={
                  <RequireRole
                    isAllowed={hasAnyRole(toAppRoles(meQuery.data!.roles), ['Admin'])}
                    onSignOut={onSignOut}
                  />
                }
              >
                <Route path="/user-access" element={<UserAccessPage session={session as Session} me={meQuery.data!} />} />
              </Route>
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
