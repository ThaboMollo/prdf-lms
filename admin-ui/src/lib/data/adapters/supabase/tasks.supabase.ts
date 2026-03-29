import type { TaskItem } from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { TasksRepository } from '../../repositories/tasks.repo'

type TaskRow = {
  id: string
  application_id: string
  title: string
  status: string
  assigned_to: string | null
  due_date: string | null
}

function mapTaskRow(row: TaskRow): TaskItem {
  return {
    id: row.id,
    applicationId: row.application_id,
    title: row.title,
    status: row.status,
    assignedTo: row.assigned_to,
    dueDate: row.due_date
  }
}

export function createSupabaseTasksAdapter(accessToken: string): TasksRepository {
  const client = createSupabaseDataClient(accessToken)
  const userId = (() => {
    try {
      const [, payload] = accessToken.split('.')
      if (!payload) return ''
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
      return json.sub ?? ''
    } catch {
      return ''
    }
  })()

  return {
    async listTasks(options?: { applicationId?: string; assignedToMe?: boolean }): Promise<TaskItem[]> {
      let query = client
        .from('tasks')
        .select('id, application_id, title, status, assigned_to, due_date')
        .order('due_date', { ascending: true, nullsFirst: false })

      if (options?.applicationId) {
        query = query.eq('application_id', options.applicationId)
      }
      if (options?.assignedToMe && userId) {
        query = query.eq('assigned_to', userId)
      }

      const { data, error } = await query
      if (error) {
        throw new Error(`Supabase list tasks failed: ${error.message}`)
      }

      return (data as TaskRow[]).map(mapTaskRow)
    },
    async createTask(input: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }): Promise<TaskItem> {
      const { data, error } = await client
        .from('tasks')
        .insert({
          application_id: input.applicationId,
          title: input.title,
          assigned_to: input.assignedTo ?? null,
          due_date: input.dueDate ?? null,
          status: 'Open'
        })
        .select('id, application_id, title, status, assigned_to, due_date')
        .single()

      if (error) {
        throw new Error(`Supabase create task failed: ${error.message}`)
      }

      return mapTaskRow(data as TaskRow)
    },
    async completeTask(taskId: string, note?: string): Promise<TaskItem> {
      const { data, error } = await client
        .from('tasks')
        .update({ status: 'Completed' })
        .eq('id', taskId)
        .select('id, application_id, title, status, assigned_to, due_date')
        .single()

      if (error) {
        throw new Error(`Supabase complete task failed: ${error.message}`)
      }

      if (note && userId) {
        await client.from('notes').insert({
          application_id: (data as TaskRow).application_id,
          body: note,
          created_by: userId
        })
      }

      return mapTaskRow(data as TaskRow)
    }
  }
}
