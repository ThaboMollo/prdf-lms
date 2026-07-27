import type { TaskItem } from '../../api'
import { createApiTasksAdapter } from '../adapters/api/tasks.api'

export type TasksRepository = {
  listTasks: (options?: { applicationId?: string; assignedToMe?: boolean }) => Promise<TaskItem[]>
  createTask: (input: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }) => Promise<TaskItem>
  completeTask: (taskId: string, note?: string) => Promise<TaskItem>
}

export function createTasksRepository(accessToken: string): TasksRepository {
  return createApiTasksAdapter(accessToken)
}
