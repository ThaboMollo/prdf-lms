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
import { useCaseDrawer } from '../components/shared/CaseDrawer'
import {
  type ApplicationSummary,
  type MeResponse,
  type NotificationItem,
  type TaskItem
} from '../lib/api'
import { calculateDaysElapsed, formatCurrency, formatDateTime } from '../lib/format'
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
  const caseDrawer = useCaseDrawer()

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
    enabled: true
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

      {(appsQuery.isError || tasksQuery.isError || notificationsQuery.isError) ? (
        <div className="card stack-sm" role="alert">
          <p className="text-error">
            Some dashboard data could not be loaded.
            {appsQuery.error instanceof Error ? ` Applications: ${appsQuery.error.message}` : ''}
            {tasksQuery.error instanceof Error ? ` Tasks: ${tasksQuery.error.message}` : ''}
            {notificationsQuery.error instanceof Error ? ` Notifications: ${notificationsQuery.error.message}` : ''}
          </p>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              void appsQuery.refetch()
              void tasksQuery.refetch()
              void notificationsQuery.refetch()
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!appsQuery.isLoading && !appsQuery.isError && !tasksQuery.isError ? (
        <DashboardContent
          role={primaryRole}
          applications={applications}
          tasks={tasks}
          notifications={notifications}
          onOpenCase={caseDrawer.open}
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
  onOpenCase: (id: string) => void
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
  onOpenCase,
  queuePage,
  tasksPage,
  setQueuePage,
  setTasksPage
}: DashboardContentProps) {
  const draftOrInfoApps = applications.filter((item) => item.status === 'Draft' || item.status === 'InfoRequested')
  const inReviewApps = applications.filter(
    (item) => item.status === 'Screening' || item.status === 'DueDiligence' || item.status === 'Evaluation'
  )
  const infoRequestedApps = applications.filter((item) => item.status === 'InfoRequested')
  const slaBreached = applications.filter(
    (item) =>
      (item.status === 'Submitted' || item.status === 'Screening' || item.status === 'DueDiligence' || item.status === 'Evaluation') &&
      calculateDaysElapsed(item.submittedAt) >= 5
  )

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

  return (
    <>
      <div className="grid-four">
        <KPIStatCard label="Pipeline Cases" value={applications.length} to="/pipeline" />
        <KPIStatCard label="In Review" value={inReviewApps.length} to="/pipeline" />
        <KPIStatCard label="Info Requested" value={infoRequestedApps.length} to="/pipeline?status=InfoRequested" />
        <KPIStatCard
          label="SLA Breached"
          value={slaBreached.length}
          variant={slaBreached.length > 0 ? 'warning' : undefined}
          to="/pipeline?status=SLA"
        />
      </div>
      <QueuePanel title="Assigned Queue" applications={applications} page={queuePage} onPageChange={setQueuePage} onOpenCase={onOpenCase} />
      <TaskPanel tasks={tasks} page={tasksPage} onPageChange={setTasksPage} onOpenCase={onOpenCase} />
    </>
  )
}

function QueuePanel({
  title,
  applications,
  page,
  onPageChange,
  onOpenCase
}: {
  title: string
  applications: ApplicationSummary[]
  page: number
  onPageChange: (page: number) => void
  onOpenCase?: (id: string) => void
}) {
  if (!applications.length) {
    return <EmptyState title={title} message="No applications in this queue." />
  }

  const paged = paginateItems(applications, page, DASHBOARD_QUEUE_PAGE_SIZE)

  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="list-clean">
        {paged.items.map((app) => {
          const inner = (
            <>
              <div>
                <p className="list-title">{app.purpose || `#${app.id.slice(0, 8)}`}</p>
                <small>{formatCurrency(app.requestedAmount)} · Updated {formatDateTime(app.submittedAt ?? app.createdAt)}</small>
              </div>
              <StatusBadge status={app.status} />
            </>
          )
          return onOpenCase ? (
            <li key={app.id}>
              <button type="button" className="queue-row" onClick={() => onOpenCase(app.id)}>
                {inner}
              </button>
            </li>
          ) : (
            <li key={app.id} className="list-row">
              {inner}
            </li>
          )
        })}
      </ul>
      <PaginationControls page={paged.page} totalPages={paged.totalPages} onPageChange={onPageChange} />
    </section>
  )
}

function TaskPanel({
  tasks,
  page,
  onPageChange,
  onOpenCase
}: {
  tasks: TaskItem[]
  page: number
  onPageChange: (page: number) => void
  onOpenCase?: (id: string) => void
}) {
  if (!tasks.length) {
    return <EmptyState title="Tasks Due Today" message="No due tasks in your queue." />
  }

  const paged = paginateItems(tasks, page, DASHBOARD_TASKS_PAGE_SIZE)

  return (
    <section className="card">
      <h2>Tasks Due Today</h2>
      <ul className="list-clean">
        {paged.items.map((task) => {
          const inner = (
            <>
              <div>
                <p className="list-title">{task.title}</p>
                <small>{task.dueDate ?? 'No due date'}</small>
              </div>
              <span>{task.status}</span>
            </>
          )
          return onOpenCase ? (
            <li key={task.id}>
              <button type="button" className="queue-row" onClick={() => onOpenCase(task.applicationId)}>
                {inner}
              </button>
            </li>
          ) : (
            <li key={task.id} className="list-row">
              {inner}
            </li>
          )
        })}
      </ul>
      <PaginationControls page={paged.page} totalPages={paged.totalPages} onPageChange={onPageChange} />
    </section>
  )
}
