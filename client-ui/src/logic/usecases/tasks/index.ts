import { createTasksRepository } from '../../../lib/data/repositories/tasks.repo'

export function createTasksUseCases(accessToken: string) {
  const repository = createTasksRepository(accessToken)

  return {
    listTasks: (options?: { applicationId?: string; assignedToMe?: boolean }) => repository.listTasks(options),
    createTask: (input: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }) => repository.createTask(input),
    completeTask: (taskId: string, note?: string) => repository.completeTask(taskId, note)
  }
}
