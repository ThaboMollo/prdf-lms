import type { Session } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { KPIStatCard } from '../components/shared/KPIStatCard'
import type { ApplicationSummary, MeResponse } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { createApplicationsUseCases } from '../logic/usecases/applications'

type HomePageProps = {
  session: Session
  me: MeResponse
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getNextAction(app: ApplicationSummary): { label: string; to: string } | null {
  switch (app.status) {
    case 'Draft':
      return { label: 'Resume your draft', to: `/apply?draft=${app.id}` }
    case 'InfoRequested':
      return { label: 'Upload requested documents', to: '/documents' }
    case 'Approved':
      return { label: 'View approval details', to: '/status' }
    default:
      return null
  }
}

export function HomePage({ session, me }: HomePageProps) {
  const navigate = useNavigate()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])

  const appsQuery = useQuery({
    queryKey: ['home-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const applications = appsQuery.data ?? []
  const displayName = me.fullName?.trim() || 'there'

  const activeApp = applications.find(
    (a) => !['Closed', 'Rejected', 'Withdrawn'].includes(a.status)
  )

  const submitted = applications.filter((a) => a.status !== 'Draft').length
  const activeLoans = applications.filter((a) => ['Disbursed', 'InRepayment'].includes(a.status)).length
  const outstanding = applications
    .filter((a) => a.status === 'InRepayment')
    .reduce((sum, a) => sum + (a.requestedAmount ?? 0), 0)

  return (
    <section className="client-page">
      <div>
        <p className="dashboard-greeting">
          {getGreeting()},{' '}
          <span>{displayName}</span>
        </p>
        <p className="dashboard-sub">Here is an overview of your business funding journey.</p>
      </div>

      {appsQuery.isError ? (
        <EmptyState
          title="Could not load dashboard"
          message="Your application summary could not be loaded. Retry when your connection is stable."
          ctaLabel="Retry"
          onCtaClick={() => appsQuery.refetch()}
        />
      ) : null}

      {!appsQuery.isError && appsQuery.isLoading ? <ListSkeleton rows={3} /> : null}

      {!appsQuery.isError && !appsQuery.isLoading && activeApp ? (
        <ActiveApplicationCard app={activeApp} onNavigate={navigate} />
      ) : null}

      {!appsQuery.isError && !appsQuery.isLoading && !activeApp ? (
        <div className="active-loan-card" style={{ borderLeftColor: 'var(--muted)' }}>
          <div className="active-loan-card-header">
            <div>
              <h2>No active applications</h2>
              <p>Ready to grow your business? Start a new loan application today.</p>
            </div>
          </div>
          <div className="active-loan-cta">
            <button className="btn btn-primary" type="button" onClick={() => navigate('/apply')}>
              Apply for Funding
            </button>
          </div>
        </div>
      ) : null}

      <div className="dashboard-kpi-row">
        <KPIStatCard label="Applications submitted" value={submitted} />
        <KPIStatCard label="Active loans" value={activeLoans} />
        <KPIStatCard
          label="Amount outstanding"
          value={outstanding > 0 ? `R ${outstanding.toLocaleString('en-ZA')}` : '-'}
        />
      </div>

      {!appsQuery.isError && !appsQuery.isLoading && applications.length > 0 ? (
        <RecentActivity applications={applications.slice(0, 5)} />
      ) : null}

      {!appsQuery.isError && !appsQuery.isLoading && applications.length === 0 ? (
        <EmptyState
          title="No applications yet"
          message="Start your first application to see updates here."
          ctaLabel="Apply for Funding"
          ctaHref="/apply"
        />
      ) : null}
    </section>
  )
}

function ActiveApplicationCard({
  app,
  onNavigate,
}: {
  app: ApplicationSummary
  onNavigate: (to: string) => void
}) {
  const nextAction = getNextAction(app)

  const statusMessages: Partial<Record<string, string>> = {
    Draft: 'Your application is saved as a draft. Complete it to submit for review.',
    Submitted: 'Your application has been submitted and is waiting to be assigned.',
    UnderReview: "Our team is currently reviewing your application. We will be in touch soon.",
    InfoRequested: 'We need additional information from you. Please upload the requested documents.',
    Approved: 'Your loan application has been approved.',
    Disbursed: 'Your loan has been disbursed to your business account.',
    InRepayment: 'Your loan is active and in repayment.',
    Closed: 'This loan has been closed.',
  }

  return (
    <div className="active-loan-card">
      <div className="active-loan-card-header">
        <div>
          <p className="section-eyebrow">Active Application</p>
          <h2>{app.purpose || 'Loan Application'}</h2>
          <p>{statusMessages[app.status] ?? 'Application in progress.'}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>
      {nextAction ? (
        <div className="active-loan-cta">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate(nextAction.to)}
          >
            {nextAction.label}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onNavigate('/status')}
          >
            View all applications
          </button>
        </div>
      ) : null}
    </div>
  )
}

function RecentActivity({ applications }: { applications: ApplicationSummary[] }) {
  return (
    <section className="card recent-activity-card">
      <h2>Recent Activity</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Application</th>
              <th>Updated</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id}>
                <td>{app.purpose || `Application ${app.id.slice(0, 8)}`}</td>
                <td>{formatDateTime(app.submittedAt ?? app.createdAt)}</td>
                <td>{app.requestedAmount ? `R ${app.requestedAmount.toLocaleString('en-ZA')}` : '-'}</td>
                <td><StatusBadge status={app.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
