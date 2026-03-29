import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import type { ApplicationSummary, MeResponse } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createNotificationsUseCases } from '../logic/usecases/notifications'

type HomePageProps = {
  session: Session
  me: MeResponse
}

export function HomePage({ session, me }: HomePageProps) {
  const navigate = useNavigate()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const notificationsUseCases = useMemo(() => createNotificationsUseCases(accessToken), [accessToken])

  const appsQuery = useQuery({
    queryKey: ['home-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const notificationsQuery = useQuery({
    queryKey: ['home-notifications', session.user.id],
    queryFn: () => notificationsUseCases.listNotifications(true),
    enabled: false
  })

  const applications = appsQuery.data ?? []
  const notifications = notificationsQuery.data ?? []
  const displayName = me.fullName?.trim() || 'there'
  const draftOrInfoApps = applications.filter((item) => item.status === 'Draft' || item.status === 'InfoRequested')

  return (
    <section className="client-page">
      <div className="client-hero">
        <div className="hero-copy">
          <p className="eyebrow">Client Portal</p>
          <h1>Welcome back, {displayName}</h1>
          <p className="hero-sub">Start a new application, upload documents, and track your progress in one place.</p>
          <div className="hero-actions">
            <button className="btn" type="button" onClick={() => navigate('/apply')}>Start an application</button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/status')}>Track my status</button>
          </div>
        </div>
        <div className="hero-card">
          <h3>Your progress</h3>
          <div className="progress-steps">
            <div className={`step ${applications.length ? 'step-active' : ''}`}>1. Apply</div>
            <div className={`step ${applications.some((item) => item.status === 'Submitted' || item.status === 'UnderReview') ? 'step-active' : ''}`}>2. Review</div>
            <div className={`step ${applications.some((item) => item.status === 'Approved' || item.status === 'Disbursed') ? 'step-active' : ''}`}>3. Disburse</div>
          </div>
          <div className="mini-stats">
            <div>
              <p className="mini-label">Applications</p>
              <p className="mini-value">{applications.length}</p>
            </div>
            <div>
              <p className="mini-label">Missing info</p>
              <p className="mini-value">{draftOrInfoApps.length}</p>
            </div>
            <div>
              <p className="mini-label">Alerts</p>
              <p className="mini-value">{notifications.length}</p>
            </div>
          </div>
        </div>
      </div>

      {appsQuery.isLoading ? (
        <div className="grid-three">
          <ListSkeleton rows={4} />
          <ListSkeleton rows={4} />
          <ListSkeleton rows={4} />
        </div>
      ) : null}

      {!appsQuery.isLoading ? <StatusUpdatesPanel applications={applications.slice(0, 5)} /> : null}
    </section>
  )
}

function StatusUpdatesPanel({ applications }: { applications: ApplicationSummary[] }) {
  if (!applications.length) {
    return <EmptyState title="No applications yet" message="Start your first application to see updates here." />
  }

  return (
    <section className="card soft-card">
      <h2>Latest updates</h2>
      <ul className="list-clean">
        {applications.map((app) => (
          <li key={app.id} className="list-row">
            <div>
              <p className="list-title">Application {app.id.slice(0, 8)}</p>
              <small>Updated {formatDateTime(app.submittedAt ?? app.createdAt)}</small>
            </div>
            <StatusBadge status={app.status} />
          </li>
        ))}
      </ul>
    </section>
  )
}
