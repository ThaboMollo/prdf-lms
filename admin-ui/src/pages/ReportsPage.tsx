import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { createReportsUseCases } from '../logic/usecases/reports'
import { getUserProfiles } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/format'
import { PageHeader } from '../components/shared/PageHeader'
import { KPIStatCard } from '../components/shared/KPIStatCard'
import { EmptyState } from '../components/shared/EmptyState'
import { PaginationControls } from '../components/shared/PaginationControls'
import { paginateItems } from '../lib/pagination'

type ReportsPageProps = {
  session: Session
}

type ReportCat = 'all' | 'perf' | 'risk' | 'comp' | 'act'

const AUDIT_PAGE_SIZE = 15

const REPORT_CATS: { key: ReportCat; label: string }[] = [
  { key: 'all', label: 'All reports' },
  { key: 'perf', label: 'Performance' },
  { key: 'risk', label: 'Portfolio & Risk' },
  { key: 'comp', label: 'Compliance' },
  { key: 'act', label: 'Activity' }
]

function getDateRange(timeRange: string): { startDate?: string; endDate?: string } {
  if (timeRange === 'all') return {}
  const days = Number(timeRange)
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { startDate: start.toISOString(), endDate: new Date().toISOString() }
}

export function ReportsPage({ session }: ReportsPageProps) {
  const [timeRange, setTimeRange] = useState('all')
  const [category, setCategory] = useState<ReportCat>('all')
  const [auditPage, setAuditPage] = useState(1)
  const reportsUseCases = useMemo(() => createReportsUseCases(session.access_token), [session.access_token])

  const { startDate, endDate } = getDateRange(timeRange)

  const pipelineQuery = useQuery({
    queryKey: ['reports-pipeline', session.user.id, timeRange],
    queryFn: () => reportsUseCases.getPipelineSummary(startDate, endDate)
  })

  const originationQuery = useQuery({
    queryKey: ['reports-origination', session.user.id, timeRange],
    queryFn: () => reportsUseCases.getOriginationTrends(startDate, endDate)
  })

  const turnaroundQuery = useQuery({
    queryKey: ['reports-turnaround', session.user.id],
    queryFn: () => reportsUseCases.getTurnaround()
  })

  const conversionQuery = useQuery({
    queryKey: ['reports-conversion', session.user.id],
    queryFn: () => reportsUseCases.getPipelineConversion()
  })

  const productivityQuery = useQuery({
    queryKey: ['reports-productivity', session.user.id],
    queryFn: () => reportsUseCases.getProductivity()
  })

  const auditQuery = useQuery({
    queryKey: ['reports-audit', session.user.id, timeRange],
    queryFn: () => reportsUseCases.getAuditLog(startDate, endDate, 100)
  })

  const demographicQuery = useQuery({
    queryKey: ['reports-demographic', session.user.id],
    queryFn: () => reportsUseCases.getDemographicBreakdown()
  })

  const debtorsAgeQuery = useQuery({
    queryKey: ['reports-debtors-age', session.user.id],
    queryFn: () => reportsUseCases.getDebtorsAgeAnalysis()
  })

  const provinceQuery = useQuery({
    queryKey: ['reports-province', session.user.id],
    queryFn: () => reportsUseCases.getProvinceBreakdown()
  })

  // ADM-073 proposed new reports. Each degrades to an empty state if its
  // endpoint is unavailable (retry disabled so a missing endpoint doesn't spin).
  const collectionsQuery = useQuery({
    queryKey: ['reports-collections', session.user.id],
    queryFn: () => reportsUseCases.getCollectionsPerformance(),
    retry: false
  })

  const cohortQuery = useQuery({
    queryKey: ['reports-cohort', session.user.id],
    queryFn: () => reportsUseCases.getCohortAnalysis(),
    retry: false
  })

  const officerQuery = useQuery({
    queryKey: ['reports-officer-scorecard', session.user.id],
    queryFn: () => reportsUseCases.getOfficerScorecard(),
    retry: false
  })

  const concentrationQuery = useQuery({
    queryKey: ['reports-concentration', session.user.id],
    queryFn: () => reportsUseCases.getConcentrationRisk(),
    retry: false
  })

  const collectionsData = useMemo(
    () => (collectionsQuery.data ?? []).map((item) => ({ name: item.month, due: item.amountDue, collected: item.amountCollected, rate: item.collectionRatePct })),
    [collectionsQuery.data]
  )

  // Productivity and audit rows carry raw user ids; resolve them to names so
  // the tables read as people, not uuids. Batched into one lookup.
  const staffIds = useMemo(() => {
    const ids = new Set<string>()
    productivityQuery.data?.forEach((row) => { if (row.userId) ids.add(row.userId) })
    auditQuery.data?.forEach((row) => { if (row.actorUserId) ids.add(row.actorUserId) })
    return Array.from(ids).sort()
  }, [productivityQuery.data, auditQuery.data])

  const staffNamesQuery = useQuery({
    queryKey: ['reports-staff-names', session.user.id, staffIds],
    queryFn: () => getUserProfiles(session.access_token, staffIds),
    enabled: staffIds.length > 0
  })

  const nameFor = (id: string | null | undefined): string => {
    if (!id) return '—'
    return staffNamesQuery.data?.get(id) ?? `#${id.slice(0, 8)}`
  }

  const pagedAudit = useMemo(
    () => paginateItems(auditQuery.data ?? [], auditPage, AUDIT_PAGE_SIZE),
    [auditQuery.data, auditPage]
  )

  const pipelineData = useMemo(
    () => (pipelineQuery.data ?? []).map((item) => ({ name: item.status, count: item.count, totalAmount: item.totalAmount })),
    [pipelineQuery.data]
  )

  const originationData = useMemo(
    () => (originationQuery.data ?? []).map((item) => ({ name: item.month, count: item.count, amount: item.totalAmount })),
    [originationQuery.data]
  )

  const conversionData = useMemo(
    () => (conversionQuery.data ?? []).map((item) => ({ name: `${item.fromStatus} → ${item.toStatus}`, count: item.count })),
    [conversionQuery.data]
  )

  const handleExportCsv = (type: 'pipeline' | 'origination' | 'productivity' | 'audit' | 'demographic' | 'debtors-age' | 'province') => {
    let csv = ''
    let filename = ''

    if (type === 'province' && provinceQuery.data) {
      csv = [
        'Dimension,Label,Count',
        ...provinceQuery.data.byProvince.map(i => `Province,"${i.label}",${i.count}`),
        ...provinceQuery.data.bySpatialType.map(i => `Spatial,"${i.label}",${i.count}`)
      ].join('\n')
      filename = 'province_breakdown.csv'
    } else if (type === 'demographic' && demographicQuery.data) {
      const lines = [
        `Total Clients,${demographicQuery.data.totalClients}`,
        '',
        'Category,Label,Count',
        ...demographicQuery.data.byGender.map(i => `Gender,"${i.label}",${i.count}`),
        ...demographicQuery.data.flags.map(i => `Designation,"${i.label}",${i.count}`)
      ]
      csv = lines.join('\n')
      filename = 'demographic_breakdown.csv'
    } else if (type === 'debtors-age' && debtorsAgeQuery.data) {
      csv = 'AgeBucket,Installments,OutstandingAmount\n' + debtorsAgeQuery.data.map(i => `"${i.bucket}",${i.installments},${i.outstandingAmount.toFixed(2)}`).join('\n')
      filename = 'debtors_age_analysis.csv'
    } else if (type === 'pipeline' && pipelineQuery.data) {
      csv = 'Status,Count,TotalAmount\n' + pipelineQuery.data.map(i => `${i.status},${i.count},${i.totalAmount}`).join('\n')
      filename = 'pipeline_summary.csv'
    } else if (type === 'origination' && originationQuery.data) {
      csv = 'Month,LoansOriginated,TotalVolume\n' + originationQuery.data.map(i => `${i.month},${i.count},${i.totalAmount}`).join('\n')
      filename = 'origination_trends.csv'
    } else if (type === 'productivity' && productivityQuery.data) {
      csv = 'UserId,TasksCompleted,ApplicationsHandled\n' + productivityQuery.data.map(i => `"${i.userId}",${i.tasksCompleted},${i.applicationsHandled}`).join('\n')
      filename = 'staff_productivity.csv'
    } else if (type === 'audit' && auditQuery.data) {
      csv = 'Timestamp,ActorUserId,Action,Entity,EntityId\n' + auditQuery.data.map(i => `"${i.at}","${i.actorUserId ?? ''}","${i.action}","${i.entity}","${i.entityId ?? ''}"`).join('\n')
      filename = 'audit_log.csv'
    }

    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.setAttribute('href', URL.createObjectURL(blob))
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="stack reports-body" data-cat={category}>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Monitor pipeline performance, origination trends, and export metric summaries."
        actions={
          <select className="input" value={timeRange} onChange={e => { setTimeRange(e.target.value); setAuditPage(1) }}>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
        }
      />

      {/* Turnaround KPI */}
      <div className="grid-two">
        <KPIStatCard
          label="Avg. Turnaround (days)"
          value={turnaroundQuery.isLoading ? '—' : turnaroundQuery.data?.averageDays != null ? turnaroundQuery.data.averageDays.toFixed(1) : '—'}
          variant={turnaroundQuery.data?.averageDays != null && turnaroundQuery.data.averageDays >= 5 ? 'warning' : undefined}
        />
        <KPIStatCard
          label="Applications Measured"
          value={turnaroundQuery.isLoading ? '—' : turnaroundQuery.data?.count ?? '—'}
        />
      </div>

      <div className="chip-row" role="group" aria-label="Report category">
        {REPORT_CATS.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={category === cat.key ? 'filter-chip is-active' : 'filter-chip'}
            aria-pressed={category === cat.key}
            onClick={() => setCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Pipeline + Origination charts */}
      <div className="grid-two" data-report-cat="perf">
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Pipeline Status Summary</h3>
          {pipelineQuery.isLoading ? <p>Loading...</p> : !pipelineData.length ? <EmptyState title="No data" message="No pipeline data for selected range." /> : (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={pipelineData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-soft)' }} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Applications" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Origination Volume Trend</h3>
          {originationQuery.isLoading ? <p>Loading...</p> : !originationData.length ? <EmptyState title="No data" message="No origination data for selected range." /> : (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={originationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={val => `R${val / 1000}k`} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} contentStyle={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-soft)' }} />
                  <Line type="monotone" dataKey="amount" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }} name="Total Volume" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Conversion */}
      <div className="card" data-report-cat="perf">
        <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Pipeline Conversion</h3>
        {conversionQuery.isLoading ? <p>Loading...</p> : !conversionData.length ? <EmptyState title="No data" message="No conversion data available." /> : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={conversionData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-light)" />
                <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-soft)' }} />
                <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} name="Transitions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Staff Productivity */}
      <div className="card" data-report-cat="act">
        <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Staff Productivity</h3>
        {productivityQuery.isLoading ? <p>Loading...</p> : !productivityQuery.data?.length ? <EmptyState title="No data" message="No productivity data available." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Tasks Completed</th>
                  <th>Applications Handled</th>
                </tr>
              </thead>
              <tbody>
                {productivityQuery.data.map((row) => (
                  <tr key={row.userId}>
                    <td>{nameFor(row.userId)}</td>
                    <td>{row.tasksCompleted}</td>
                    <td>{row.applicationsHandled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="card" data-report-cat="act">
        <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Audit Log</h3>
        {auditQuery.isLoading ? <p>Loading...</p> : !auditQuery.data?.length ? <EmptyState title="No activity" message="No audit events for the selected period." /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAudit.items.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.at)}</td>
                      <td>{nameFor(row.actorUserId)}</td>
                      <td>{row.action}</td>
                      <td>{row.entity}{row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls page={pagedAudit.page} totalPages={pagedAudit.totalPages} onPageChange={setAuditPage} />
          </>
        )}
      </div>

      {/* Regulatory / Compliance */}
      <div className="grid-two" data-report-cat="comp risk">
        <div className="card">
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Demographic Breakdown</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            Client composition for NCR / SEDFA compliance reporting.
          </p>
          {demographicQuery.isLoading ? <p>Loading...</p> : !demographicQuery.data?.totalClients ? (
            <EmptyState title="No data" message="No client demographic data available." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Category</th><th>Count</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {demographicQuery.data.byGender.map((row) => (
                    <tr key={`gender-${row.label}`}>
                      <td>Gender · {row.label}</td>
                      <td>{row.count}</td>
                      <td>{((row.count / demographicQuery.data!.totalClients) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {demographicQuery.data.flags.map((row) => (
                    <tr key={`flag-${row.label}`}>
                      <td>{row.label}</td>
                      <td>{row.count}</td>
                      <td>{((row.count / demographicQuery.data!.totalClients) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total Clients</td>
                    <td>{demographicQuery.data.totalClients}</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Debtors Book Age Analysis</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            Outstanding installments aged by days overdue.
          </p>
          {debtorsAgeQuery.isLoading ? <p>Loading...</p> : !debtorsAgeQuery.data?.length ? (
            <EmptyState title="No data" message="No outstanding installments to age." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Age Bucket</th><th>Installments</th><th>Outstanding</th></tr>
                </thead>
                <tbody>
                  {debtorsAgeQuery.data.map((row) => (
                    <tr key={row.bucket}>
                      <td>{row.bucket}</td>
                      <td>{row.installments}</td>
                      <td>{formatCurrency(row.outstandingAmount)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    <td>{debtorsAgeQuery.data.reduce((s, r) => s + r.installments, 0)}</td>
                    <td>{formatCurrency(debtorsAgeQuery.data.reduce((s, r) => s + r.outstandingAmount, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Province & Spatial Breakdown */}
      <div className="grid-two" data-report-cat="comp">
        <div className="card">
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Province Breakdown</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            Client distribution across the nine provinces for NCR / SEDFA reporting.
          </p>
          {provinceQuery.isLoading ? <p>Loading...</p> : !provinceQuery.data?.totalClients ? (
            <EmptyState title="No data" message="No client province data available." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Province</th><th>Count</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {provinceQuery.data.byProvince.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.count}</td>
                      <td>{((row.count / provinceQuery.data!.totalClients) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total Clients</td>
                    <td>{provinceQuery.data.totalClients}</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Spatial Classification</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            Rural / Township / City split (RFQ spatial preference points).
          </p>
          {provinceQuery.isLoading ? <p>Loading...</p> : !provinceQuery.data?.totalClients ? (
            <EmptyState title="No data" message="No client spatial data available." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Location Type</th><th>Count</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {provinceQuery.data.bySpatialType.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.count}</td>
                      <td>{((row.count / provinceQuery.data!.totalClients) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total Clients</td>
                    <td>{provinceQuery.data.totalClients}</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ADM-073: Collections performance */}
      <div className="card" data-report-cat="perf risk">
        <h3 style={{ marginBottom: '0.25rem', fontWeight: 600 }}>Collections Performance</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          Amount due vs. collected per month, with the resulting collection rate.
        </p>
        {collectionsQuery.isLoading ? <p>Loading...</p> : collectionsQuery.isError ? (
          <EmptyState title="Unavailable" message="The collections report endpoint is not available yet." />
        ) : !collectionsData.length ? <EmptyState title="No data" message="No matured installments to report on." /> : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={collectionsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={val => `R${val / 1000}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} cursor={{ fill: 'transparent' }} contentStyle={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-soft)' }} />
                <Bar dataKey="due" fill="var(--cat2)" radius={[4, 4, 0, 0]} name="Amount Due" />
                <Bar dataKey="collected" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Collected" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ADM-073: Cohort / vintage analysis */}
      <div className="card" data-report-cat="risk perf">
        <h3 style={{ marginBottom: '0.25rem', fontWeight: 600 }}>Cohort / Vintage Analysis</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          Loans grouped by disbursement month and how each origination cohort is performing.
        </p>
        {cohortQuery.isLoading ? <p>Loading...</p> : cohortQuery.isError ? (
          <EmptyState title="Unavailable" message="The cohort report endpoint is not available yet." />
        ) : !cohortQuery.data?.length ? <EmptyState title="No data" message="No disbursed loans to analyse." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Vintage</th><th>Loans</th><th>Disbursed</th><th>Repaid</th><th>Outstanding</th><th>Arrears</th></tr>
              </thead>
              <tbody>
                {cohortQuery.data.map((row) => (
                  <tr key={row.vintage}>
                    <td>{row.vintage}</td>
                    <td>{row.loans}</td>
                    <td>{formatCurrency(row.principalDisbursed)}</td>
                    <td>{formatCurrency(row.principalRepaid)}</td>
                    <td>{formatCurrency(row.outstanding)}</td>
                    <td>{formatCurrency(row.arrearsAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADM-073: Officer scorecard */}
      <div className="card" data-report-cat="act perf">
        <h3 style={{ marginBottom: '0.25rem', fontWeight: 600 }}>Officer Scorecard</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          Volume and book quality per loan officer (the application's assignee).
        </p>
        {officerQuery.isLoading ? <p>Loading...</p> : officerQuery.isError ? (
          <EmptyState title="Unavailable" message="The officer scorecard endpoint is not available yet." />
        ) : !officerQuery.data?.length ? <EmptyState title="No data" message="No applications are assigned to an officer yet." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Officer</th><th>Assigned</th><th>Approved</th><th>Disbursed</th><th>Principal</th><th>Arrears</th></tr>
              </thead>
              <tbody>
                {officerQuery.data.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td>{row.applicationsAssigned}</td>
                    <td>{row.approved}</td>
                    <td>{row.disbursed}</td>
                    <td>{formatCurrency(row.principalDisbursed)}</td>
                    <td>{formatCurrency(row.arrearsAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADM-073: Concentration risk */}
      <div className="card" data-report-cat="risk">
        <h3 style={{ marginBottom: '0.25rem', fontWeight: 600 }}>Concentration Risk</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          Exposure to individual borrowers and industries. HHI is a 0–10 000 concentration gauge (higher = more concentrated).
        </p>
        {concentrationQuery.isLoading ? <p>Loading...</p> : concentrationQuery.isError ? (
          <EmptyState title="Unavailable" message="The concentration risk endpoint is not available yet." />
        ) : !concentrationQuery.data?.totalOutstanding ? (
          <EmptyState title="No data" message="No live (disbursed / in-repayment) loans to measure." />
        ) : (
          <>
            <div className="grid-two" style={{ marginBottom: '1.5rem' }}>
              <KPIStatCard
                label="Borrower HHI"
                value={concentrationQuery.data.hhi.borrower}
                variant={concentrationQuery.data.hhi.borrower >= 2500 ? 'warning' : undefined}
              />
              <KPIStatCard
                label="Industry HHI"
                value={concentrationQuery.data.hhi.industry}
                variant={concentrationQuery.data.hhi.industry >= 2500 ? 'warning' : undefined}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Top Borrower</th><th>Loans</th><th>Outstanding</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {concentrationQuery.data.topBorrowers.map((row) => (
                    <tr key={row.clientId}>
                      <td>{row.businessName}</td>
                      <td>{row.loans}</td>
                      <td>{formatCurrency(row.outstanding)}</td>
                      <td>{((row.outstanding / concentrationQuery.data!.totalOutstanding) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Export Center */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Export Center</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Download aggregated data for external analysis.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report Type</th>
                <th>Description</th>
                <th>Format</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Pipeline Snapshot</strong></td>
                <td>Current breakdown of applications by status and total requested amounts.</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('pipeline')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Origination Trends</strong></td>
                <td>Month-over-month disbursed loan volume and counts.</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('origination')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Staff Productivity</strong></td>
                <td>Tasks completed and applications handled per staff member.</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('productivity')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Audit Log</strong></td>
                <td>System event log for the selected time range (up to 100 entries).</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('audit')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Demographic Breakdown</strong></td>
                <td>Client composition by gender and designation (HDP, disability, rural, black women-owned).</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('demographic')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Debtors Book Age Analysis</strong></td>
                <td>Outstanding installments aged by days overdue (30/60/90/120+).</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('debtors-age')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Province Breakdown</strong></td>
                <td>Client distribution by province and spatial classification (Rural/Township/City).</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('province')}>Download</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
