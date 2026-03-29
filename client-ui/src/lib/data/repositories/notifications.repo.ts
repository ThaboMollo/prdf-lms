import type { NotificationItem } from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createApiNotificationsAdapter } from '../adapters/api/notifications.api'
import { createSupabaseNotificationsAdapter } from '../adapters/supabase/notifications.supabase'

export type NotificationsRepository = {
  listNotifications: (unreadOnly?: boolean) => Promise<NotificationItem[]>
  markRead: (id: string) => Promise<void>
}

export function createNotificationsRepository(accessToken: string): NotificationsRepository {
  const provider = getDataProvider()
  if (provider === 'api') {
    return createApiNotificationsAdapter(accessToken)
  }

  return createSupabaseNotificationsAdapter(accessToken)
}
