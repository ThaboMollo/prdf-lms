import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { KPIStatCard } from '../components/shared/KPIStatCard'
import { ListSkeleton } from '../components/shared/Skeletons'
import { PageHeader } from '../components/shared/PageHeader'
import { StatusBadge } from '../components/shared/StatusBadge'
import {
  type ApplicationSummary,
  type MeResponse,
  type NotificationItem,
  type TaskItem
} from '../lib/api'
import { formatDateTime } from '../lib/format'
import { getPrimaryRole, toAppRoles } from '../lib/rbac'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createNotificationsUseCases } from '../logic/usecases/notifications'
import { createTasksUseCases } from '../logic/usecases/tasks'

type DashboardPageProps = {
  session: Session
  me: MeResponse
}

export function DashboardPage({ session, me }: DashboardPageProps) {
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const tasksUseCases = useMemo(() => createTasksUseCases(accessToken), [accessToken])
  const notificationsUseCases = useMemo(() => createNotificationsUseCases(accessToken), [accessToken])
  const roles = toAppRoles(me.roles)
  const primaryRole = getPrimaryRole(roles)

  const appsQuery = useQuery({
    queryKey: ['dashboard-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const tasksQuery = useQuery({
    queryKey: ['dashboard-tasks', session.user.id],
    queryFn: () => tasksUseCases.listTasks({ assignedToMe: true })
  })

  const notificationsQuery = useQuery({
    queryKey: ['dashboard-notifications', session.user.id],
    queryFn: () => notificationsUseCases.listNotifications(true),
    enabled: false
  })

  const applications = appsQuery.data ?? []
  const tasks = tasksQuery.data ?? []
  const notifications = notificationsQuery.data ?? []

  return (
    <section className="stack">
      <PageHeader
        title={`${primaryRole} Dashboard`}
        subtitle="Role-aware workspace with your queue, updates, and next actions."
      />

      {(appsQuery.isLoading || tasksQuery.isLoading) ? (
        <div className="grid-three">
          <ListSkeleton rows={4} />
          <ListSkeleton rows={4} />
          <ListSkeleton rows={4} />
        </div>
      ) : null}

      {!appsQuery.isLoading ? <DashboardContent role={primaryRole} applications={applications} tasks={tasks} notifications={notifications} /> : null}
    </section>
  )
}

type DashboardContentProps = {
  role: ReturnType<typeof getPrimaryRole>
  applications: ApplicationSummary[]
  tasks: TaskItem[]
  notifications: NotificationItem[]
}

function DashboardContent({ role, applications, tasks, notifications }: DashboardContentProps) {
  const draftOrInfoApps = applications.filter((item) => item.status === 'Draft' || item.status === 'InfoRequested')
  const submittedApps = applications.filter((item) => item.status === 'Submitted' || item.status === 'UnderReview')
  const overdueTasks = tasks.filter((task) => task.status !== 'Completed' && Boolean(task.dueDate))

  if (!applications.length && !tasks.length) {
    return <EmptyState title="No activity yet" message="Your dashboard will populate as soon as applications and tasks are created." />
  }

  if (role === 'Client') {
    return (
      <>
        <div className="grid-three">
          <KPIStatCard label="My Applications" value={applications.length} />
          <KPIStatCard label="Missing Info" value={draftOrInfoApps.length} />
          <KPIStatCard label="Unread Alerts" value={notifications.length} />
        </div>
        <QueuePanel title="Latest Status Updates" applications={applications.slice(0, 5)} />
      </>
    )
  }

  if (role === 'Intern' || role === 'Originator') {
    return (
      <>
        <div className="grid-three">
          <KPIStatCard label="Applicants Assisted" value={applications.length} />
          <KPIStatCard label="Tasks Due" value={overdueTasks.length} />
          <KPIStatCard label="Quick Action" value="Create Application" />
        </div>
        <TaskPanel tasks={tasks.slice(0, 6)} />
      </>
    )
  }

  return (
    <>
      <div className="grid-three">
        <KPIStatCard label="Pipeline Cases" value={applications.length} />
        <KPIStatCard label="Under Review" value={submittedApps.length} />
        <KPIStatCard label="Overdue Tasks" value={overdueTasks.length} />
      </div>
      <QueuePanel title="Assigned Queue" applications={applications.slice(0, 6)} />
    </>
  )
}

function QueuePanel({ title, applications }: { title: string; applications: ApplicationSummary[] }) {
  if (!applications.length) {
    return <EmptyState title={title} message="No applications in this queue." />
  }

  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="list-clean">
        {applications.map((app) => (
          <li key={app.id} className="list-row">
            <div>
              <p className="list-title">{app.id.slice(0, 8)}</p>
              <small>Updated {formatDateTime(app.submittedAt ?? app.createdAt)}</small>
            </div>
            <StatusBadge status={app.status} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function TaskPanel({ tasks }: { tasks: TaskItem[] }) {
  if (!tasks.length) {
    return <EmptyState title="Tasks Due Today" message="No due tasks in your queue." />
  }

  return (
    <section className="card">
      <h2>Tasks Due Today</h2>
      <ul className="list-clean">
        {tasks.map((task) => (
          <li key={task.id} className="list-row">
            <div>
              <p className="list-title">{task.title}</p>
              <small>{task.dueDate ?? 'No due date'}</small>
            </div>
            <span>{task.status}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
