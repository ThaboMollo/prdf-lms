import type { Session } from '@supabase/supabase-js'
import { Link, Outlet } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { listNotifications, markNotificationRead } from '../lib/api'

type AppShellProps = {
  session: Session | null
}

export function AppShell({ session }: AppShellProps) {
  const email = session?.user?.email ?? 'unknown'
  const accessToken = session?.access_token ?? ''
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery({
    queryKey: ['notifications', session?.user.id],
    queryFn: () => listNotifications(accessToken, true),
    enabled: Boolean(accessToken),
    refetchInterval: 30000
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(accessToken, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications', session?.user.id] })
    }
  })

  return (
    <div style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif' }}>
      <header style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <strong>PRDF LMS</strong>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/applications">Applications</Link>
        <Link to="/loans">Loan Details</Link>
        <Link to="/portfolio">Portfolio</Link>
        <span style={{ marginLeft: 8 }}>
          Notifications: {notificationsQuery.data?.length ?? 0}
        </span>
        <button onClick={() => supabase.auth.signOut()} style={{ marginLeft: 'auto' }}>
          Logout
        </button>
      </header>
      <p style={{ marginTop: 0 }}>Signed in as: {email}</p>
      {notificationsQuery.data?.length ? (
        <div style={{ marginBottom: 16, border: '1px solid #ddd', padding: 8 }}>
          <strong>Unread Notifications</strong>
          <ul>
            {notificationsQuery.data.slice(0, 5).map((n) => (
              <li key={n.id}>
                {n.title}: {n.message}
                <button onClick={() => markReadMutation.mutate(n.id)} disabled={markReadMutation.isPending}>
                  Mark read
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Outlet />
    </div>
  )
}
