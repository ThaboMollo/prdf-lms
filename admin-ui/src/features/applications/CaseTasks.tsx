import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTasksUseCases } from '../../logic/usecases/tasks'
import { listAssignableUsers } from '../../lib/api'
import type { AssignableUser, TaskItem } from '../../lib/api'
import { EmptyState } from '../../components/shared/EmptyState'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { useToast } from '../../components/shared/ToastProvider'
import { formatDate } from '../../lib/format'

type CaseTasksProps = {
  applicationId: string
  accessToken: string
}

export function CaseTasks({ applicationId, accessToken }: CaseTasksProps) {
  const tasksUseCases = useMemo(() => createTasksUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [dueDate, setDueDate] = useState('')

  const tasksQuery = useQuery({
    queryKey: ['case-tasks', applicationId],
    queryFn: () => tasksUseCases.listTasks({ applicationId })
  })
  const assignableQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async (): Promise<AssignableUser[]> => {
      const users = await listAssignableUsers(accessToken)
      return [...users].sort((a, b) => a.name.localeCompare(b.name))
    }
  })

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['case-tasks', applicationId] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      tasksUseCases.createTask({ applicationId, title, assignedTo: assignTo || undefined, dueDate: dueDate || undefined }),
    onSuccess: async () => {
      toast.push('Task created.', 'success')
      setTitle('')
      setAssignTo('')
      setDueDate('')
      await invalidate()
    },
    onError: () => toast.push('Task creation failed.', 'error')
  })

  const completeMutation = useMutation({
    mutationFn: (task: TaskItem) => tasksUseCases.completeTask(task.id, 'Completed from case workspace.'),
    onSuccess: invalidate,
    onError: () => toast.push('Could not complete task.', 'error')
  })

  const tasks = tasksQuery.data ?? []

  return (
    <div className="stack-sm">
      <div className="form-grid">
        <label>
          Task title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Assign to
          <select value={assignTo} onChange={(event) => setAssignTo(event.target.value)}>
            <option value="">Unassigned</option>
            {(assignableQuery.data ?? []).map((user) => (
              <option key={user.userId} value={user.userId}>{user.name}</option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <button className="btn" type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !title.trim()}>
          {createMutation.isPending ? 'Creating…' : 'Create task'}
        </button>
      </div>

      {tasksQuery.isLoading ? <p>Loading tasks…</p> : tasks.length ? (
        <ul className="list-clean">
          {tasks.map((task) => (
            <li key={task.id} className="list-row">
              <div>
                <p className="list-title">{task.title}</p>
                <small>{task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}</small>
              </div>
              {task.status !== 'Completed' ? (
                <button className="btn btn-secondary" type="button" onClick={() => completeMutation.mutate(task)} disabled={completeMutation.isPending}>
                  Complete
                </button>
              ) : (
                <StatusBadge status={task.status} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No tasks" message="Create tasks to track action items for this case." />
      )}
    </div>
  )
}
