import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { KPIStatCard } from '../components/shared/KPIStatCard'
import { ListSkeleton } from '../components/shared/Skeletons'
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
import { useNavigate } from 'react-router-dom'

type DashboardPageProps = {
  session: Session
  me: MeResponse
}

export function DashboardPage({ session, me }: DashboardPageProps) {
  const navigate = useNavigate()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const tasksUseCases = useMemo(() => createTasksUseCases(accessToken), [accessToken])
  const notificationsUseCases = useMemo(() => createNotificationsUseCases(accessToken), [accessToken])
  const roles = toAppRoles(me.roles)
  const primaryRole = getPrimaryRole(roles)
  const displayName = me.fullName?.trim() || 'there'
  const headerTitle = primaryRole === 'Client' ? `Welcome back, ${displayName}` : `${primaryRole} Dashboard`
  const headerSubtitle =
    primaryRole === 'Client'
      ? 'Track your application progress, documents, and updates at a glance.'
      : 'Role-aware workspace with your queue, updates, and next actions.'

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
  const draftOrInfoApps = applications.filter((item) => item.status === 'Draft' || item.status === 'InfoRequested')
  const submittedApps = applications.filter((item) => item.status === 'Submitted' || item.status === 'UnderReview')

  return (
    <section className="client-page">
      <div className="client-hero">
        <div className="hero-copy">
          <p className="eyebrow">Client Portal</p>
          <h1>{headerTitle}</h1>
          <p className="hero-sub">{headerSubtitle}</p>
          <div className="hero-actions">
            <button className="btn" type="button" onClick={() => navigate('/applications')}>Start new application</button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/applications')}>View my applications</button>
          </div>
        </div>
        <div className="hero-card">
          <h3>Application progress</h3>
          <div className="progress-steps">
            <div className={`step ${applications.length ? 'step-active' : ''}`}>1. Apply</div>
            <div className={`step ${submittedApps.length ? 'step-active' : ''}`}>2. Review</div>
            <div className={`step ${applications.some((item) => item.status === 'Approved' || item.status === 'Disbursed') ? 'step-active' : ''}`}>3. Disburse</div>
          </div>
          <div className="mini-stats">
            <div>
              <p className="mini-label">My applications</p>
              <p className="mini-value">{applications.length}</p>
            </div>
            <div>
              <p className="mini-label">Missing info</p>
              <p className="mini-value">{draftOrInfoApps.length}</p>
            </div>
          </div>
        </div>
      </div>

      {(appsQuery.isLoading || tasksQuery.isLoading) ? (
        <div className="grid-three">
          <ListSkeleton rows={4} />
          <ListSkeleton rows={4} />
          <ListSkeleton rows={4} />
        </div>
      ) : null}

      {!appsQuery.isLoading ? (
        <DashboardContent role={primaryRole} applications={applications} tasks={tasks} notifications={notifications} />
      ) : null}
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
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-label">My applications</p>
            <p className="stat-value">{applications.length}</p>
            <p className="stat-hint">Active, draft, or submitted</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Missing info</p>
            <p className="stat-value">{draftOrInfoApps.length}</p>
            <p className="stat-hint">Complete to speed up review</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Unread alerts</p>
            <p className="stat-value">{notifications.length}</p>
            <p className="stat-hint">Status updates and reminders</p>
          </div>
        </div>
        <div className="content-grid">
          <QueuePanel title="Latest status updates" applications={applications.slice(0, 5)} />
          <NextActionsPanel applications={draftOrInfoApps} />
        </div>
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
    <section className="card soft-card">
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

function NextActionsPanel({ applications }: { applications: ApplicationSummary[] }) {
  if (!applications.length) {
    return (
      <section className="card soft-card">
        <h2>Next actions</h2>
        <p className="muted-text">No outstanding actions right now.</p>
      </section>
    )
  }

  return (
    <section className="card soft-card">
      <h2>Next actions</h2>
      <ul className="list-clean">
        {applications.slice(0, 4).map((app) => (
          <li key={app.id} className="list-row">
            <div>
              <p className="list-title">Complete application {app.id.slice(0, 6)}</p>
              <small>Status: {app.status}</small>
            </div>
            <span className="status-pill">Action needed</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
