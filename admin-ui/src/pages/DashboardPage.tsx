import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { KPIStatCard } from '../components/shared/KPIStatCard'
import { PaginationControls } from '../components/shared/PaginationControls'
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
import { paginateItems, parsePageParam } from '../lib/pagination'
import { getPrimaryRole, toAppRoles } from '../lib/rbac'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createNotificationsUseCases } from '../logic/usecases/notifications'
import { createTasksUseCases } from '../logic/usecases/tasks'

type DashboardPageProps = {
  session: Session
  me: MeResponse
}

const DASHBOARD_QUEUE_PAGE_SIZE = 6
const DASHBOARD_TASKS_PAGE_SIZE = 6

export function DashboardPage({ session, me }: DashboardPageProps) {
  const [params, setParams] = useSearchParams()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const tasksUseCases = useMemo(() => createTasksUseCases(accessToken), [accessToken])
  const notificationsUseCases = useMemo(() => createNotificationsUseCases(accessToken), [accessToken])
  const roles = toAppRoles(me.roles)
  const primaryRole = getPrimaryRole(roles)

  const queuePage = parsePageParam(params.get('queuePage'))
  const tasksPage = parsePageParam(params.get('tasksPage'))

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

      {!appsQuery.isLoading ? (
        <DashboardContent
          role={primaryRole}
          applications={applications}
          tasks={tasks}
          notifications={notifications}
          queuePage={queuePage}
          tasksPage={tasksPage}
          setQueuePage={(nextPage) => {
            const next = new URLSearchParams(params)
            next.set('queuePage', String(nextPage))
            setParams(next)
          }}
          setTasksPage={(nextPage) => {
            const next = new URLSearchParams(params)
            next.set('tasksPage', String(nextPage))
            setParams(next)
          }}
        />
      ) : null}
    </section>
  )
}

type DashboardContentProps = {
  role: ReturnType<typeof getPrimaryRole>
  applications: ApplicationSummary[]
  tasks: TaskItem[]
  notifications: NotificationItem[]
  queuePage: number
  tasksPage: number
  setQueuePage: (page: number) => void
  setTasksPage: (page: number) => void
}

function DashboardContent({
  role,
  applications,
  tasks,
  notifications,
  queuePage,
  tasksPage,
  setQueuePage,
  setTasksPage
}: DashboardContentProps) {
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
        <QueuePanel title="Latest Status Updates" applications={applications} page={queuePage} onPageChange={setQueuePage} />
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
        <TaskPanel tasks={tasks} page={tasksPage} onPageChange={setTasksPage} />
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
      <QueuePanel title="Assigned Queue" applications={applications} page={queuePage} onPageChange={setQueuePage} />
    </>
  )
}

function QueuePanel({
  title,
  applications,
  page,
  onPageChange
}: {
  title: string
  applications: ApplicationSummary[]
  page: number
  onPageChange: (page: number) => void
}) {
  if (!applications.length) {
    return <EmptyState title={title} message="No applications in this queue." />
  }

  const paged = paginateItems(applications, page, DASHBOARD_QUEUE_PAGE_SIZE)

  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="list-clean">
        {paged.items.map((app) => (
          <li key={app.id} className="list-row">
            <div>
              <p className="list-title">{app.id.slice(0, 8)}</p>
              <small>Updated {formatDateTime(app.submittedAt ?? app.createdAt)}</small>
            </div>
            <StatusBadge status={app.status} />
          </li>
        ))}
      </ul>
      <PaginationControls page={paged.page} totalPages={paged.totalPages} onPageChange={onPageChange} />
    </section>
  )
}

function TaskPanel({ tasks, page, onPageChange }: { tasks: TaskItem[]; page: number; onPageChange: (page: number) => void }) {
  if (!tasks.length) {
    return <EmptyState title="Tasks Due Today" message="No due tasks in your queue." />
  }

  const paged = paginateItems(tasks, page, DASHBOARD_TASKS_PAGE_SIZE)

  return (
    <section className="card">
      <h2>Tasks Due Today</h2>
      <ul className="list-clean">
        {paged.items.map((task) => (
          <li key={task.id} className="list-row">
            <div>
              <p className="list-title">{task.title}</p>
              <small>{task.dueDate ?? 'No due date'}</small>
            </div>
            <span>{task.status}</span>
          </li>
        ))}
      </ul>
      <PaginationControls page={paged.page} totalPages={paged.totalPages} onPageChange={onPageChange} />
    </section>
  )
}
