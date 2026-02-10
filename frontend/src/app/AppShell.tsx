import type { Session } from '@supabase/supabase-js'
import { Link, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AppShellProps = {
  session: Session | null
}

export function AppShell({ session }: AppShellProps) {
  const email = session?.user?.email ?? 'unknown'

  return (
    <div style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif' }}>
      <header style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <strong>PRDF LMS</strong>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/applications">Applications</Link>
        <Link to="/loans">Loan Details</Link>
        <Link to="/portfolio">Portfolio</Link>
        <button onClick={() => supabase.auth.signOut()} style={{ marginLeft: 'auto' }}>
          Logout
        </button>
      </header>
      <p style={{ marginTop: 0 }}>Signed in as: {email}</p>
      <Outlet />
    </div>
  )
}
