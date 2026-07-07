import type { Session } from '@supabase/supabase-js'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import type { ApplicationSummary, MeResponse } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/format'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createLoansUseCases } from '../logic/usecases/loans'

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

const REPAYMENT_STATUSES = new Set(['Disbursed', 'InRepayment', 'Closed'])

function getMilestoneState(milestone: Milestone, appStatus: string): 'done' | 'active' | 'pending' {
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
      <div className="page-header">
        <div>
          <h1>Application Status</h1>
          <p>Track the progress of your loan applications.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/apply')}>
          New Application
        </button>
      </div>

      {appsQuery.isError ? (
        <EmptyState
          title="Could not load application status"
          message="Your application status could not be loaded. Retry when your connection is stable."
          ctaLabel="Retry"
          onCtaClick={() => appsQuery.refetch()}
        />
      ) : null}

      {!appsQuery.isError && appsQuery.isLoading ? <ListSkeleton rows={6} /> : null}

      {!appsQuery.isError && !appsQuery.isLoading && !applications.length ? (
        <EmptyState
          title="No applications yet"
          message="Create your first application to track its progress here."
          ctaLabel="Apply Now"
          ctaHref="/apply"
        />
      ) : null}

      {!appsQuery.isError && applications.map((app) => (
        <ApplicationTimeline key={app.id} app={app} accessToken={accessToken} />
      ))}
    </section>
  )
}

function ApplicationTimeline({ app, accessToken }: { app: ApplicationSummary; accessToken: string }) {
  if (app.status === 'Draft') {
    return (
      <div className="status-app-card">
        <div className="status-app-card-header">
          <div>
            <p className="section-eyebrow">Draft</p>
            <h3>{app.purpose || `Application ${app.id.slice(0, 8)}`}</h3>
            <p className="muted-text">Created {formatDateTime(app.createdAt)}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>
        <p className="muted-text">
          This application is still in draft. Complete and submit it to begin the review process.
        </p>
        <div style={{ marginTop: '0.75rem' }}>
          <Link to={`/apply?draft=${app.id}`} className="btn btn-primary">
            Resume your draft
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="status-app-card">
      <div className="status-app-card-header">
        <div>
          <p className="section-eyebrow">Application - {app.id.slice(0, 8)}</p>
          <h3>{app.purpose || 'Loan Application'}</h3>
          <p className="muted-text">Last updated {formatDateTime(app.submittedAt ?? app.createdAt)}</p>
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
                    ? <i className="fa-solid fa-check" aria-hidden="true" />
                    : state === 'active'
                    ? <i className="fa-solid fa-circle" aria-hidden="true" />
                    : null}
                </div>
                {!isLast ? (
                  <div className={`timeline-line${state === 'done' ? ' timeline-line--done' : ''}`} />
                ) : null}
              </div>
              <div className="timeline-content">
                <h4 className={state === 'pending' ? 'muted' : ''}>{milestone.label}</h4>
                {state !== 'pending' ? (
                  <p>{state === 'active' && app.status === 'InfoRequested' && milestone.key === 'UnderReview'
                    ? 'Additional information has been requested. Please upload the required documents.'
                    : milestone.description}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {app.status === 'InfoRequested' ? (
        <div className="next-step">
          <h3>Action required</h3>
          <p>Please check your notifications and upload the requested documents.</p>
        </div>
      ) : null}

      {REPAYMENT_STATUSES.has(app.status) ? (
        <RepaymentSection appId={app.id} accessToken={accessToken} />
      ) : null}
    </div>
  )
}

function RepaymentSection({ appId, accessToken }: { appId: string; accessToken: string }) {
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const loansUseCases = useMemo(() => createLoansUseCases(accessToken), [accessToken])

  const detailsQuery = useQuery({
    queryKey: ['status-app-detail', appId],
    queryFn: () => applicationsUseCases.getApplication(appId)
  })

  const loanId = detailsQuery.data?.loanId

  const loanQuery = useQuery({
    queryKey: ['status-loan', loanId],
    queryFn: () => loansUseCases.getLoan(loanId!),
    enabled: Boolean(loanId)
  })

  if (detailsQuery.isLoading) {
    return <div className="repayment-section"><p className="muted-text">Loading loan details...</p></div>
  }

  if (!loanId) return null

  const loan = loanQuery.data
  const nextInstalment = loan?.schedule.find(s => s.status === 'Pending' || s.status === 'Overdue')

  return (
    <div className="repayment-section">
      <h3>Repayment Summary</h3>

      {loanQuery.isLoading ? (
        <p className="muted-text">Loading...</p>
      ) : loan ? (
        <>
          <div className="repayment-kpis">
            <div className="repayment-kpi">
              <span className="repayment-kpi-label">Outstanding Balance</span>
              <span className="repayment-kpi-value">{formatCurrency(loan.outstandingPrincipal)}</span>
            </div>
            {nextInstalment ? (
              <div className="repayment-kpi">
                <span className="repayment-kpi-label">Next Instalment Due</span>
                <span className="repayment-kpi-value">{formatCurrency(nextInstalment.dueTotal)}</span>
                <span className="repayment-kpi-sub">{nextInstalment.dueDate}</span>
              </div>
            ) : (
              <div className="repayment-kpi">
                <span className="repayment-kpi-label">Next Instalment</span>
                <span className="repayment-kpi-value">—</span>
              </div>
            )}
            <div className="repayment-kpi">
              <span className="repayment-kpi-label">Loan Status</span>
              <span className="repayment-kpi-value">{loan.status}</span>
            </div>
          </div>

          <button
            type="button"
            className="link-btn"
            onClick={() => setScheduleOpen((o) => !o)}
            style={{ marginTop: '0.75rem' }}
          >
            {scheduleOpen ? 'Hide schedule' : 'View full schedule'} ({loan.schedule.length} instalments)
          </button>

          {scheduleOpen && (
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Due Date</th>
                    <th>Amount Due</th>
                    <th>Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.schedule.map((item) => (
                    <tr key={item.id}>
                      <td>{item.installmentNo}</td>
                      <td>{item.dueDate}</td>
                      <td>{formatCurrency(item.dueTotal)}</td>
                      <td>{formatCurrency(item.paidAmount)}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : loanQuery.isError ? (
        <p className="muted-text">Could not load loan details.</p>
      ) : null}
    </div>
  )
}
