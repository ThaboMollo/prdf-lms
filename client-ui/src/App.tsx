import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from './app/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { RequireClientProgress } from './components/RequireClientProgress'
import { CardSkeleton } from './components/shared/Skeletons'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'
import { ApplyPage } from './pages/ApplyPage'
import { StatusPage } from './pages/StatusPage'
import { fetchMe, type MeResponse } from './lib/api'
import { getDataProvider } from './lib/config/dataProvider'
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

      const provider = getDataProvider()
      if (provider === 'supabase') {
        return resolveMeFromSession(session)
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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth session={session} />}>
        {protectedReady ? (
          <Route element={<RequireRole me={meQuery.data!} allowed={['Client']} />}>
            <Route element={<AppShell session={session as Session} me={meQuery.data!} />}>
              <Route element={<RequireClientProgress session={session as Session} />}>
                <Route path="/home" element={<HomePage session={session as Session} me={meQuery.data!} />} />
                <Route path="/status" element={<StatusPage session={session as Session} me={meQuery.data!} />} />
              </Route>
              <Route path="/apply" element={<ApplyPage session={session as Session} me={meQuery.data!} />} />
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
      <Route path="*" element={<Navigate to={session ? '/apply' : '/login'} replace />} />
    </Routes>
  )
}

function resolveMeFromSession(session: Session): MeResponse {
  const appMetadata = session.user.app_metadata as Record<string, unknown> | undefined
  const userMetadata = session.user.user_metadata as Record<string, unknown> | undefined

  const appRoles = Array.isArray(appMetadata?.roles) ? appMetadata.roles.filter((x): x is string => typeof x === 'string') : []
  const userRoles = Array.isArray(userMetadata?.roles) ? userMetadata.roles.filter((x): x is string => typeof x === 'string') : []
  const mergedRoles = [...new Set([...appRoles, ...userRoles])]
  const firstName = typeof userMetadata?.first_name === 'string' ? userMetadata.first_name.trim() : ''
  const lastName = typeof userMetadata?.last_name === 'string' ? userMetadata.last_name.trim() : ''
  const fallbackName = `${firstName} ${lastName}`.trim()
  const fullName =
    typeof userMetadata?.full_name === 'string' && userMetadata.full_name.trim()
      ? userMetadata.full_name
      : (fallbackName || null)

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    fullName,
    roles: mergedRoles.length ? mergedRoles : ['Client']
  }
}
