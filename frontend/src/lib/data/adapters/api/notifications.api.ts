import { listNotifications, markNotificationRead } from '../../../api'
import type { NotificationsRepository } from '../../repositories/notifications.repo'

export function createApiNotificationsAdapter(accessToken: string): NotificationsRepository {
  return {
    listNotifications: (unreadOnly?: boolean) => listNotifications(accessToken, unreadOnly),
    markRead: (id: string) => markNotificationRead(accessToken, id)
  }
}
