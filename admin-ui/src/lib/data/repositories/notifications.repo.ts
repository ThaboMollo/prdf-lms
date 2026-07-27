import type { NotificationItem } from '../../api'
import { createApiNotificationsAdapter } from '../adapters/api/notifications.api'

export type NotificationsRepository = {
  listNotifications: (unreadOnly?: boolean) => Promise<NotificationItem[]>
  markRead: (id: string) => Promise<void>
}

export function createNotificationsRepository(accessToken: string): NotificationsRepository {
  return createApiNotificationsAdapter(accessToken)
}
