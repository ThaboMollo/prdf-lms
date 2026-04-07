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

type StatusPageProps = {
  session: Session
  me: MeResponse
}

type Milestone = {
  key: string
  label: string
  description: string
  statuses: string[]
}

const MILESTONES: Milestone[] = [
  {
    key: 'Submitted',
    label: 'Application Submitted',
    description: 'Your application has been received and is awaiting assignment.',
    statuses: ['Submitted'],
  },
  {
    key: 'UnderReview',
    label: 'Under Review',
    description: 'Our team is reviewing your application and documents.',
    statuses: ['UnderReview', 'InfoRequested'],
  },
  {
    key: 'Approved',
    label: 'Approved',
    description: 'Your loan application has been approved.',
    statuses: ['Approved'],
  },
  {
    key: 'Disbursed',
    label: 'Funds Disbursed',
    description: 'Loan funds have been transferred to your business account.',
    statuses: ['Disbursed'],
  },
  {
    key: 'InRepayment',
    label: 'In Repayment',
    description: 'Your loan is active. Monthly instalments are being collected.',
    statuses: ['InRepayment'],
  },
  {
    key: 'Closed',
    label: 'Loan Closed',
    description: 'This loan has been fully repaid and closed.',
    statuses: ['Closed'],
  },
]

const STATUS_ORDER = [
  'Draft', 'Submitted', 'UnderReview', 'InfoRequested',
  'Approved', 'Disbursed', 'InRepayment', 'Closed',
]

function getMilestoneState(milestone: Milestone, appStatus: string): 'done' | 'active' | 'pending' {
  // Special case: InfoRequested maps to UnderReview milestone
  const normalizedStatus = appStatus === 'InfoRequested' ? 'UnderReview' : appStatus

  if (milestone.statuses.includes(appStatus)) return 'active'

  const milestoneStatusIndex = STATUS_ORDER.indexOf(milestone.statuses[0])
  const currentStatusIndex = STATUS_ORDER.indexOf(normalizedStatus)

  if (milestoneStatusIndex < currentStatusIndex) return 'done'
  return 'pending'
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Application Status</h1>
          <p style={{ color: 'var(--muted)', margin: '0.35rem 0 0' }}>
            Track the progress of your loan applications.
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/apply')}>
          + New Application
        </button>
      </div>

      {appsQuery.isLoading ? <ListSkeleton rows={6} /> : null}

      {!appsQuery.isLoading && !applications.length ? (
        <EmptyState
          title="No applications yet"
          message="Create your first application to track its progress here."
          ctaLabel="Apply Now"
          ctaHref="/apply"
        />
      ) : null}

      {applications.map((app) => (
        <ApplicationTimeline key={app.id} app={app} />
      ))}
    </section>
  )
}

function ApplicationTimeline({ app }: { app: ApplicationSummary }) {
  // Don't show draft milestones — show a nudge instead
  if (app.status === 'Draft') {
    return (
      <div className="status-app-card">
        <div className="status-app-card-header">
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Draft
            </p>
            <h3 style={{ margin: '0.25rem 0 0' }}>{app.purpose || `Application ${app.id.slice(0, 8)}`}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
              Created {formatDateTime(app.createdAt)}
            </p>
          </div>
          <StatusBadge status={app.status} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
          This application is still in draft. Complete and submit it to begin the review process.
        </p>
      </div>
    )
  }

  return (
    <div className="status-app-card">
      <div className="status-app-card-header">
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Application · {app.id.slice(0, 8)}
          </p>
          <h3 style={{ margin: '0.25rem 0 0' }}>{app.purpose || 'Loan Application'}</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
            Last updated {formatDateTime(app.submittedAt ?? app.createdAt)}
          </p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="timeline-vertical">
        {MILESTONES.map((milestone, index) => {
          const state = getMilestoneState(milestone, app.status)
          const isLast = index === MILESTONES.length - 1

          return (
            <div key={milestone.key} className="timeline-milestone">
              <div className="timeline-track">
                <div
                  className={[
                    'timeline-icon',
                    state === 'done' ? 'timeline-icon--done' : '',
                    state === 'active' ? 'timeline-icon--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`${milestone.label}: ${state}`}
                >
                  {state === 'done'
                    ? <i className="fa-solid fa-check" aria-hidden="true" style={{ fontSize: '0.8rem' }} />
                    : state === 'active'
                    ? <i className="fa-solid fa-circle" aria-hidden="true" style={{ fontSize: '0.55rem' }} />
                    : null}
                </div>
                {!isLast && (
                  <div className={`timeline-line${state === 'done' ? ' timeline-line--done' : ''}`} />
                )}
              </div>
              <div className="timeline-content">
                <h4 className={state === 'pending' ? 'muted' : ''}>{milestone.label}</h4>
                {state !== 'pending' && (
                  <p>{state === 'active' && app.status === 'InfoRequested' && milestone.key === 'UnderReview'
                    ? 'Additional information has been requested. Please upload the required documents.'
                    : milestone.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {app.status === 'InfoRequested' && (
        <p style={{ fontSize: '0.9rem', color: 'var(--alert)', fontWeight: 600, margin: 0, paddingTop: '0.5rem' }}>
          Action required: Please check your notifications and upload the requested documents.
        </p>
      )}
    </div>
  )
}
