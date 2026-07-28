import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNotificationsUseCases } from '../../client-ui/src/logic/usecases/notifications'

/**
 * In-app notification inbox — unread list + mark-read. Lifted from
 * AppShell.tsx, which already cleanly separated this data-fetching from
 * Topbar.tsx's presentation. Deliberately has no direct toast/UI dependency
 * (onMarkReadError is a caller-supplied callback) so this stays headless.
 */
export function useNotifications(
  accessToken: string,
  userId: string,
  opts: { enabled: boolean; onMarkReadError?: () => void },
) {
  const notificationsUseCases = useMemo(() => createNotificationsUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => notificationsUseCases.listNotifications(true),
    refetchInterval: opts.enabled ? 60_000 : false,
    enabled: opts.enabled,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsUseCases.markRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
    },
    onError: () => {
      opts.onMarkReadError?.()
    },
  })

  return {
    notifications: notificationsQuery.data ?? [],
    markRead: (id: string) => markReadMutation.mutate(id),
    isMarkingRead: markReadMutation.isPending,
  }
}
