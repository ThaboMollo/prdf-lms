import { createNotificationsRepository } from '../../../lib/data/repositories/notifications.repo'

export function createNotificationsUseCases(accessToken: string) {
  const repository = createNotificationsRepository(accessToken)

  return {
    listNotifications: (unreadOnly?: boolean) => repository.listNotifications(unreadOnly),
    markRead: (id: string) => repository.markRead(id)
  }
}
