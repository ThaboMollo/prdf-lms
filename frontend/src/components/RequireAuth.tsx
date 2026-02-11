import type { Session } from '@supabase/supabase-js'
import { Navigate, Outlet } from 'react-router-dom'

type RequireAuthProps = {
  session: Session | null
}

export function RequireAuth({ session }: RequireAuthProps) {
  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
