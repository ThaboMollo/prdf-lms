import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

type ProtectedRouteProps = {
  session: Session | null
}

export function ProtectedRoute({ session }: ProtectedRouteProps) {
  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
