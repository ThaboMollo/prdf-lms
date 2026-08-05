import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'
import { PaginationControls } from '../components/shared/PaginationControls'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { SlaBadge } from '../components/shared/SlaBadge'
import { useCaseDrawer } from '../components/shared/CaseDrawer'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { calculateDaysElapsed, formatCurrency, formatDateTime } from '../lib/format'
import { paginateItems, parsePageParam } from '../lib/pagination'
import type { ApplicationSummary, LoanApplicationStatus } from '../lib/api'

type PipelinePageProps = {
  session: Session
}

const PIPELINE_PAGE_SIZE = 12

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All open' },
  { key: 'Screening', label: 'Screening' },
  { key: 'DueDiligence', label: 'Due Diligence' },
  { key: 'Evaluation', label: 'Evaluation' },
  { key: 'InfoRequested', label: 'Info Requested' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Contracting', label: 'Contracting' },
  { key: 'SLA', label: 'SLA Breached' }
]

const OPEN_STATUSES: LoanApplicationStatus[] = ['Draft', 'Submitted', 'Screening', 'DueDiligence', 'Evaluation', 'InfoRequested', 'Approved', 'BoardApproved', 'Contracting']
const SLA_STATUSES: LoanApplicationStatus[] = ['Submitted', 'Screening', 'DueDiligence', 'Evaluation', 'InfoRequested']

function matchesFilter(app: ApplicationSummary, key: string): boolean {
  if (key === 'all') return OPEN_STATUSES.includes(app.status)
  if (key === 'SLA') {
    return SLA_STATUSES.includes(app.status) && Boolean(app.submittedAt) && calculateDaysElapsed(app.submittedAt) >= 5
  }
  return app.status === key
}

export function PipelinePage({ session }: PipelinePageProps) {
  const [params, setParams] = useSearchParams()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const caseDrawer = useCaseDrawer()

  const statusFilter = params.get('status') ?? 'all'
  const search = params.get('q') ?? ''
  const page = parsePageParam(params.get('page'))

  const applicationsQuery = useQuery({
    queryKey: ['pipeline-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (applicationsQuery.data ?? []).filter((app) => {
      if (!matchesFilter(app, statusFilter)) return false
      if (!q) return true
      return (
        app.id.toLowerCase().includes(q) ||
        app.clientId.toLowerCase().includes(q) ||
        app.purpose.toLowerCase().includes(q)
      )
    })
  }, [applicationsQuery.data, search, statusFilter])

  const paged = paginateItems(filtered, page, PIPELINE_PAGE_SIZE)

  // All filter/search changes reset to page 1 so the view can't strand you on
  // an out-of-range page.
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.set('page', '1')
    setParams(next)
  }

  return (
    <section className="stack">
      <PageHeader title="Pipeline" subtitle="Search and drill into cases by status." />

      <div className="card stack-sm">
        <div className="filters-row">
          <input
            aria-label="Search cases"
            placeholder="Search by purpose, application ID, or client ID"
            value={search}
            onChange={(event) => updateParam('q', event.target.value)}
          />
        </div>

        <div className="chip-row" role="group" aria-label="Filter by status">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={statusFilter === filter.key ? 'filter-chip is-active' : 'filter-chip'}
              aria-pressed={statusFilter === filter.key}
              onClick={() => updateParam('status', filter.key === 'all' ? '' : filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {applicationsQuery.isLoading ? <ListSkeleton rows={8} /> : null}

        {applicationsQuery.isError ? (
          <div className="stack-sm" role="alert">
            <p className="text-error">Could not load the pipeline.</p>
            <button className="btn btn-secondary" type="button" onClick={() => void applicationsQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        {!applicationsQuery.isLoading && !applicationsQuery.isError && !filtered.length ? (
          <EmptyState title="No matching cases" message="Adjust the filter or search to find another case." />
        ) : null}

        {!applicationsQuery.isError && filtered.length ? (
          <>
            <ul className="list-clean">
              {paged.items.map((app) => (
                <li key={app.id}>
                  <button type="button" className="queue-row" onClick={() => caseDrawer.open(app.id)}>
                    <div>
                      <p className="list-title">{app.purpose || `#${app.id.slice(0, 8)}`}</p>
                      <small>
                        {formatCurrency(app.requestedAmount)} · Updated{' '}
                        {formatDateTime(app.submittedAt ?? app.createdAt)}
                      </small>
                    </div>
                    <span className="pipeline-row__status">
                      <SlaBadge status={app.status} submittedAt={app.submittedAt} />
                      <StatusBadge status={app.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <PaginationControls
              page={paged.page}
              totalPages={paged.totalPages}
              onPageChange={(nextPage) => {
                const next = new URLSearchParams(params)
                next.set('page', String(nextPage))
                setParams(next)
              }}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
