import type { TaskItem } from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createApiTasksAdapter } from '../adapters/api/tasks.api'
import { createSupabaseTasksAdapter } from '../adapters/supabase/tasks.supabase'

export type TasksRepository = {
  listTasks: (options?: { applicationId?: string; assignedToMe?: boolean }) => Promise<TaskItem[]>
  createTask: (input: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }) => Promise<TaskItem>
  completeTask: (taskId: string, note?: string) => Promise<TaskItem>
}

export function createTasksRepository(accessToken: string): TasksRepository {
  const provider = getDataProvider()
  if (provider === 'api') {
    return createApiTasksAdapter(accessToken)
  }

  return createSupabaseTasksAdapter(accessToken)
}
