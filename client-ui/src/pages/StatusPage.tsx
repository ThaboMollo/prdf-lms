import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import type { MeResponse } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { createApplicationsUseCases } from '../logic/usecases/applications'

type StatusPageProps = {
  session: Session
  me: MeResponse
}

export function StatusPage({ session }: StatusPageProps) {
  const accessToken = session.access_token
  const navigate = useNavigate()
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])

  const appsQuery = useQuery({
    queryKey: ['status-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const applications = appsQuery.data ?? []

  return (
    <section className="client-page">
      <div className="card soft-card">
        <h1>Application status</h1>
        <p className="muted-text">Check progress, review dates, and next steps.</p>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/apply')}>
          Start a new application
        </button>
      </div>

      {appsQuery.isLoading ? <ListSkeleton rows={6} /> : null}

      {!appsQuery.isLoading && !applications.length ? (
        <EmptyState title="No applications yet" message="Create your first application to track its progress here." />
      ) : null}

      {applications.length ? (
        <div className="status-grid">
          {applications.map((app) => (
            <article key={app.id} className="card soft-card status-card">
              <div className="status-card-top">
                <div>
                  <p className="eyebrow">Application {app.id.slice(0, 8)}</p>
                  <h3>{app.purpose}</h3>
                  <p className="muted-text">Updated {formatDateTime(app.submittedAt ?? app.createdAt)}</p>
                </div>
                <StatusBadge status={app.status} />
              </div>
              <div className="status-track">
                <span className={`track-dot ${['Draft', 'Submitted', 'UnderReview', 'InfoRequested', 'Approved', 'Disbursed', 'InRepayment', 'Closed'].includes(app.status) ? 'active' : ''}`} />
                <span className={`track-dot ${['Submitted', 'UnderReview', 'Approved', 'Disbursed', 'InRepayment', 'Closed'].includes(app.status) ? 'active' : ''}`} />
                <span className={`track-dot ${['Approved', 'Disbursed', 'InRepayment', 'Closed'].includes(app.status) ? 'active' : ''}`} />
              </div>
              <p className="muted-text">Need help? Contact support with your application ID.</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
