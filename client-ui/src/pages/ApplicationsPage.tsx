import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import type { ApplicationSummary, MeResponse } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { buildLoanName } from '../../../packages/domain/loanName'

type ApplicationsPageProps = {
  session: Session
  me: MeResponse
}

export function ApplicationsPage({ session }: ApplicationsPageProps) {
  const accessToken = session.access_token
  const navigate = useNavigate()
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])

  const appsQuery = useQuery({
    queryKey: ['applications-list', session.user.id],
    queryFn: () => applicationsUseCases.listApplications(),
  })

  const applications = appsQuery.data ?? []

  return (
    <section className="client-page">
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Every loan you have applied for. Select one to review what you submitted.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/apply')}>
          New Application
        </button>
      </div>

      {appsQuery.isError ? (
        <EmptyState
          title="Could not load your applications"
          message="Your applications could not be loaded. Retry when your connection is stable."
          ctaLabel="Retry"
          onCtaClick={() => appsQuery.refetch()}
        />
      ) : appsQuery.isLoading ? (
        <ListSkeleton rows={5} />
      ) : applications.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loan</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Term</th>
                <th>Applied</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <ApplicationRow key={app.id} app={app} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Largely unreachable — RequireClientProgress sends a client with no
        // applications straight into the wizard — but the list must still
        // render something sane if that guard is ever relaxed.
        <EmptyState
          title="No applications yet"
          message="Apply for funding and your applications will be listed here."
          ctaLabel="Apply Now"
          ctaHref="/apply"
        />
      )}
    </section>
  )
}

function ApplicationRow({ app }: { app: ApplicationSummary }) {
  const name = buildLoanName({
    businessName: app.businessName,
    applicantFullName: app.applicantFullName,
    date: app.createdAt,
  })
  const isDraft = app.status === 'Draft'

  return (
    <tr>
      <td>
        <span className="app-row__name">{name}</span>
        <span className="app-row__ref">#{app.id.slice(0, 8)}</span>
      </td>
      <td><StatusBadge status={app.status} /></td>
      <td>{formatCurrency(app.requestedAmount)}</td>
      <td>{app.termMonths} months</td>
      <td>{formatDate(app.createdAt)}</td>
      <td>
        {/*
          A draft has nothing to review — it is half-filled by definition — so
          it gets the wizard instead. Everything else is read-only.
        */}
        {isDraft ? (
          <Link className="link-btn" to={`/apply?draft=${app.id}`}>Resume</Link>
        ) : (
          <Link className="link-btn" to={`/applications/${app.id}`}>View</Link>
        )}
      </td>
    </tr>
  )
}
