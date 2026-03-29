import type { NotificationItem } from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { NotificationsRepository } from '../../repositories/notifications.repo'

type NotificationRow = {
  id: string
  user_id: string
  channel: string
  type: string
  title: string
  message: string
  status: string
  created_at: string
  sent_at: string | null
  read_at: string | null
  payload: unknown
}

function mapNotificationRow(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    type: row.type,
    title: row.title,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    readAt: row.read_at,
    payloadJson: row.payload == null ? null : JSON.stringify(row.payload)
  }
}

export function createSupabaseNotificationsAdapter(accessToken: string): NotificationsRepository {
  const client = createSupabaseDataClient(accessToken)

  return {
    async listNotifications(unreadOnly = false): Promise<NotificationItem[]> {
      let query = client
        .from('notifications')
        .select('id, user_id, channel, type, title, message, status, created_at, sent_at, read_at, payload')
        .order('created_at', { ascending: false })

      if (unreadOnly) {
        query = query.is('read_at', null)
      }

      const { data, error } = await query
      if (error) {
        throw new Error(`Supabase list notifications failed: ${error.message}`)
      }

      return (data as NotificationRow[]).map(mapNotificationRow)
    },
    async markRead(id: string): Promise<void> {
      const { error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString(), status: 'Read' })
        .eq('id', id)

      if (error) {
        throw new Error(`Supabase mark notification read failed: ${error.message}`)
      }
    }
  }
}
