import { useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Outlet } from 'react-router-dom'
import type { MeResponse } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { toAppRoles } from '../../lib/rbac'
import { useToast } from '../../components/shared/ToastProvider'
import { MobileNavDrawer } from './MobileNavDrawer'
import { clientNavItems } from './navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useNotifications } from '../../../../packages/client-core/useNotifications'
import { env } from '../../lib/config/env'

type AppShellProps = {
  session: Session
  me: MeResponse
}

export function AppShell({ session, me }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const accessToken = session.access_token
  const toast = useToast()

  const { roleItems, showNav } = useMemo(() => {
    const roles = toAppRoles(me.roles)
    const items = clientNavItems.filter((item) => item.roles.some((role) => roles.includes(role)))

    return {
      roleItems: items,
      showNav: items.length > 0
    }
  }, [me.roles])

  const notificationsEnabled = env.VITE_ENABLE_NOTIFICATIONS === 'true'

  const { notifications, markRead, isMarkingRead } = useNotifications(accessToken, session.user.id, {
    enabled: notificationsEnabled,
    onMarkReadError: () => {
      toast.push('Could not mark notification as read.', 'error')
    },
  })

  return (
    <>
      <div className={showNav ? 'app-shell' : 'app-shell app-shell-no-nav'}>
        {showNav ? <Sidebar items={roleItems} title="PRDF" /> : null}
        <div className="app-main">
          <Topbar
            email={session.user.email ?? 'unknown'}
            title="Client Portal"
            showMenu={showNav}
            onMenuOpen={() => setMobileOpen(true)}
            onLogout={() => {
              supabase.auth.signOut().catch(() => {
                toast.push('Sign out failed. Please retry.', 'error')
              })
            }}
            notifications={notifications}
            onMarkRead={(id) => markRead(id)}
            isMarkingRead={isMarkingRead}
          />
          <main className="content-wrap">
            <Outlet context={{ session, me }} />
          </main>
        </div>
      </div>
      {showNav ? (
        <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} items={roleItems} title="PRDF" />
      ) : null}
    </>
  )
}
