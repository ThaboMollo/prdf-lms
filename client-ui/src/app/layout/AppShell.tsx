import { useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Outlet } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MeResponse } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { toAppRoles } from '../../lib/rbac'
import { useToast } from '../../components/shared/ToastProvider'
import { MobileNavDrawer } from './MobileNavDrawer'
import { clientNavItems } from './navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { createNotificationsUseCases } from '../../logic/usecases/notifications'
import { createApplicationsUseCases } from '../../logic/usecases/applications'

type AppShellProps = {
  session: Session
  me: MeResponse
}

export function AppShell({ session, me }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const accessToken = session.access_token
  const notificationsUseCases = useMemo(() => createNotificationsUseCases(accessToken), [accessToken])
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()
  const toast = useToast()

  const applicationsQuery = useQuery({
    queryKey: ['nav-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const { roleItems, layoutTitle, showNav } = useMemo(() => {
    const roles = toAppRoles(me.roles)
    const items = clientNavItems.filter((item) => item.roles.some((role) => roles.includes(role)))
    const apps = applicationsQuery.data ?? []
    const hasSubmitted = apps.some((app) =>
      ['Submitted', 'UnderReview', 'InfoRequested', 'Approved', 'Rejected', 'Disbursed', 'InRepayment', 'Closed'].includes(app.status)
    )
    const showNavItems = hasSubmitted ? items : []

    return {
      roleItems: showNavItems,
      layoutTitle: 'PRDF Client Portal',
      showNav: hasSubmitted
    }
  }, [me.roles, applicationsQuery.data])

  const notificationsQuery = useQuery({
    queryKey: ['notifications', session.user.id],
    queryFn: () => notificationsUseCases.listNotifications(true),
    refetchInterval: false,
    enabled: false
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsUseCases.markRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications', session.user.id] })
    },
    onError: () => {
      toast.push('Could not mark notification as read.', 'error')
    }
  })

  return (
    <>
      <div className={showNav ? 'app-shell' : 'app-shell app-shell-no-nav'}>
        {showNav ? <Sidebar items={roleItems} title={layoutTitle} /> : null}
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
            notifications={notificationsQuery.data ?? []}
            onMarkRead={(id) => markReadMutation.mutate(id)}
            isMarkingRead={markReadMutation.isPending}
          />
          <main className="content-wrap">
            <Outlet context={{ session, me }} />
          </main>
        </div>
      </div>
      {showNav ? (
        <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} items={roleItems} title={layoutTitle} />
      ) : null}
    </>
  )
}
