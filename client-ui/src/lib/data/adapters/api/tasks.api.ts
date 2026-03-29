import { completeTask, createTask, listTasks } from '../../../api'
import type { TasksRepository } from '../../repositories/tasks.repo'

export function createApiTasksAdapter(accessToken: string): TasksRepository {
  return {
    listTasks: (options?: { applicationId?: string; assignedToMe?: boolean }) => listTasks(accessToken, options),
    createTask: (input: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }) => createTask(accessToken, input),
    completeTask: (taskId: string, note?: string) => completeTask(accessToken, taskId, note)
  }
}
