import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'
import { DetailSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { LifecycleRail } from '../components/shared/LifecycleRail'
import { useToast } from '../components/shared/ToastProvider'
import { useSetBreadcrumbs } from '../components/shared/Breadcrumbs'
import { CaseDocuments } from '../features/applications/CaseDocuments'
import { CaseTasks } from '../features/applications/CaseTasks'
import { CaseNotes } from '../features/applications/CaseNotes'
import { CaseAdvisory } from '../features/applications/CaseAdvisory'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createLoansUseCases } from '../logic/usecases/loans'
import { useFormErrors, FieldError, fieldErrorAttrs, fieldDomId, type FieldErrorMap } from '../hooks/useFormErrors'
import { NumericInput } from '../components/shared/NumericInput'
import { formatCurrency, formatDateTime } from '../lib/format'
import { listAssignableUsers } from '../lib/api'
import type {
  ApplicationDetails,
  AssignableUser,
  LoanApplicationStatus,
  LoanDetails,
  StatusHistoryItem
} from '../lib/api'
import { activeTenant } from '../../../packages/tenant-config'
import { allowedNextStatuses } from '../../../packages/domain/status'

type CasePageProps = {
  session: Session
}

type TabKey = 'overview' | 'documents' | 'money' | 'tasks' | 'notes' | 'history' | 'advisory'

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'money', label: 'Money' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'history', label: 'History' }
]

/**
 * The merged application + loan workspace (spec §4.3). This ticket (ADM-030)
 * delivers the shell — header, lifecycle rail, and deep-linkable tabs with all
 * case data reachable read-only. The editing actions layer on next: left-rail
 * assign/status (ADM-031), disbursement/repayments (ADM-040) and document
 * verification (ADM-051).
 */
export function CasePage({ session }: CasePageProps) {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const accessToken = session.access_token

  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const loansUseCases = useMemo(() => createLoansUseCases(accessToken), [accessToken])

  const tenantConfig = activeTenant()
  const nfsEnabled = tenantConfig.features.nonFinancialSupport

  const detailsQuery = useQuery({
    queryKey: ['case-application', id],
    queryFn: () => applicationsUseCases.getApplication(id as string),
    enabled: Boolean(id)
  })
  const detail = detailsQuery.data
  const businessName = detail?.clientDetails?.businessName?.trim() || detail?.purpose || 'Case'

  useSetBreadcrumbs([
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: detail ? businessName : id ? `Case #${id.slice(0, 8)}` : 'Case' }
  ])

  const historyQuery = useQuery({
    queryKey: ['case-history', id],
    queryFn: () => applicationsUseCases.getHistory(id as string),
    enabled: Boolean(id)
  })
  const loanQuery = useQuery({
    queryKey: ['case-loan', detail?.loanId],
    queryFn: () => loansUseCases.getLoan(detail!.loanId as string),
    enabled: Boolean(detail?.loanId)
  })

  // --- Left-rail actions (ADM-031) ---
  const queryClient = useQueryClient()
  const toast = useToast()
  const [assignUserId, setAssignUserId] = useState('')
  const [statusTarget, setStatusTarget] = useState<LoanApplicationStatus | ''>('')
  const [statusNote, setStatusNote] = useState('')
  const [infoNote, setInfoNote] = useState('')

  useEffect(() => {
    setAssignUserId(detail?.assignedToUserId ?? '')
  }, [detail?.assignedToUserId])

  const assignableUsersQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async (): Promise<AssignableUser[]> => {
      const users = await listAssignableUsers(accessToken)
      return [...users].sort((a, b) => a.name.localeCompare(b.name))
    }
  })

  async function refreshCase() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['case-application', id] }),
      queryClient.invalidateQueries({ queryKey: ['case-history', id] })
    ])
  }

  async function refreshMoney() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['case-loan', detail?.loanId] }),
      queryClient.invalidateQueries({ queryKey: ['case-application', id] }),
      queryClient.invalidateQueries({ queryKey: ['case-history', id] })
    ])
  }

  const assignMutation = useMutation({
    mutationFn: () =>
      applicationsUseCases.assignApplication(id as string, {
        requestedAmount: detail!.requestedAmount,
        termMonths: detail!.termMonths,
        purpose: detail!.purpose,
        assignedToUserId: assignUserId || undefined
      }),
    onSuccess: async () => {
      toast.push('Assignment saved.', 'success')
      await refreshCase()
    },
    onError: () => toast.push('Assignment failed.', 'error')
  })

  const statusMutation = useMutation({
    mutationFn: () => applicationsUseCases.transitionStatus(id as string, statusTarget as LoanApplicationStatus, statusNote),
    onSuccess: async () => {
      toast.push('Status updated.', 'success')
      setStatusTarget('')
      setStatusNote('')
      await refreshCase()
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Status update failed.', 'error')
  })

  const infoMutation = useMutation({
    mutationFn: () => applicationsUseCases.transitionStatus(id as string, 'InfoRequested', infoNote),
    onSuccess: async () => {
      toast.push('Info request submitted.', 'success')
      setInfoNote('')
      await refreshCase()
    },
    onError: () => toast.push('Could not request more info.', 'error')
  })

  const tabs = nfsEnabled ? [...BASE_TABS, { key: 'advisory' as TabKey, label: 'Advisory (NFS)' }] : BASE_TABS
  const tabParam = params.get('tab')
  const activeTab: TabKey = tabs.some((tab) => tab.key === tabParam) ? (tabParam as TabKey) : 'overview'

  function setTab(key: TabKey) {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    setParams(next)
  }

  if (!id) {
    return (
      <section className="stack">
        <PageHeader title="Case" subtitle="No case selected." />
        <EmptyState title="No case selected" message="Open a case from the pipeline or dashboard." />
      </section>
    )
  }

  return (
    <section className="stack">
      {detailsQuery.isLoading ? <DetailSkeleton /> : null}
      {detailsQuery.isError ? <p className="text-error">Could not load this case.</p> : null}

      {detail ? (
        <>
          <PageHeader
            title={businessName}
            subtitle={`${detail.clientDetails?.fullName ?? 'Client'} · ${formatCurrency(detail.requestedAmount)} · #${detail.id.slice(0, 8)}`}
            actions={<StatusBadge status={detail.status} />}
          />

          <div className="card">
            <LifecycleRail status={detail.status} />
          </div>

          <div className="case-layout">
            <aside className="case-rail stack-sm">
              <NextStepCard status={detail.status} onGoToMoney={() => setTab('money')} />
              <div className="card stack-sm">
                <h3>Case actions</h3>
                <label>
                  Assign to
                  <select
                    value={assignUserId}
                    onChange={(event) => setAssignUserId(event.target.value)}
                    disabled={assignableUsersQuery.isLoading}
                  >
                    <option value="">Unassigned</option>
                    {(assignableUsersQuery.data ?? []).map((user) => (
                      <option key={user.userId} value={user.userId}>{user.name}</option>
                    ))}
                  </select>
                </label>
                <button className="btn" type="button" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
                  {assignMutation.isPending ? 'Saving…' : 'Save assignment'}
                </button>

                {allowedNextStatuses(detail.status).length ? (
                  <>
                    <label>
                      Change status
                      <select value={statusTarget} onChange={(event) => setStatusTarget(event.target.value as LoanApplicationStatus)}>
                        <option value="">— select next status —</option>
                        {allowedNextStatuses(detail.status).map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status note
                      <input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional note" />
                    </label>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => statusMutation.mutate()}
                      disabled={!statusTarget || statusMutation.isPending}
                    >
                      {statusMutation.isPending ? 'Updating…' : 'Update status'}
                    </button>
                  </>
                ) : null}

                {detail.status === 'Submitted' || detail.status === 'UnderReview' ? (
                  <>
                    <label>
                      Request info
                      <input value={infoNote} onChange={(event) => setInfoNote(event.target.value)} placeholder="What is missing?" />
                    </label>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => infoMutation.mutate()}
                      disabled={!infoNote.trim() || infoMutation.isPending}
                    >
                      {infoMutation.isPending ? 'Requesting…' : 'Request more info'}
                    </button>
                  </>
                ) : null}
              </div>
            </aside>

            <div className="card">
            <div className="tabs-row">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab === tab.key ? 'tab tab-active' : 'tab'}
                  onClick={() => setTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' ? <OverviewTab detail={detail} /> : null}
            {activeTab === 'documents' ? <CaseDocuments applicationId={detail.id} accessToken={accessToken} /> : null}
            {activeTab === 'money' ? (
              <MoneyTab
                loanId={detail.loanId ?? null}
                loan={loanQuery.data}
                loading={loanQuery.isLoading}
                loansUseCases={loansUseCases}
                onChanged={refreshMoney}
              />
            ) : null}
            {activeTab === 'tasks' ? <CaseTasks applicationId={detail.id} accessToken={accessToken} /> : null}
            {activeTab === 'notes' ? <CaseNotes applicationId={detail.id} accessToken={accessToken} /> : null}
            {activeTab === 'history' ? <HistoryTab history={historyQuery.data ?? []} loading={historyQuery.isLoading} /> : null}
            {activeTab === 'advisory' ? <CaseAdvisory clientId={detail.clientId} applicationId={detail.id} accessToken={accessToken} /> : null}
            </div>
          </div>

        </>
      ) : null}
    </section>
  )
}

function NextStepCard({ status, onGoToMoney }: { status: LoanApplicationStatus; onGoToMoney: () => void }) {
  let title = 'Next step'
  let message = 'Continue working this case.'

  if (status === 'Submitted') {
    message = 'Awaiting review — assign a reviewer or move it under review.'
  } else if (status === 'UnderReview') {
    title = 'Decision needed'
    message = 'Approve, reject, or request more info below.'
  } else if (status === 'InfoRequested') {
    title = 'Waiting on client'
    message = 'Review the response, then update the status.'
  } else if (status === 'Approved') {
    title = 'Prepare disbursement'
    message = 'Move to the Money tab to create the loan and disburse.'
  } else if (status === 'InRepayment') {
    title = 'Loan servicing'
    message = 'Record repayments and track arrears in the Money tab.'
  } else if (status === 'Rejected' || status === 'Closed') {
    title = 'Case closed'
    message = 'This case is no longer active.'
  }

  const showMoney = status === 'Approved' || status === 'InRepayment' || status === 'Disbursed'

  return (
    <section className="next-step">
      <h3>{title}</h3>
      <p>{message}</p>
      {showMoney ? (
        <div className="inline-actions">
          <button className="btn" type="button" onClick={onGoToMoney}>Go to Money →</button>
        </div>
      ) : null}
    </section>
  )
}

function OverviewTab({ detail }: { detail: ApplicationDetails }) {
  const client = detail.clientDetails
  return (
    <dl className="detail-grid">
      <dt>Client name</dt>
      <dd>{client?.fullName ?? '—'}</dd>
      <dt>Contact phone</dt>
      <dd>{client?.phone ?? '—'}</dd>
      <dt>Business name</dt>
      <dd>{client?.businessName ?? '—'}</dd>
      <dt>Registration no.</dt>
      <dd>{client?.registrationNo ?? '—'}</dd>
      <dt>Address</dt>
      <dd>{client?.address ?? '—'}</dd>
      <dt>Employment status</dt>
      <dd>{client?.employmentStatus ?? '—'}</dd>
      <dt>Requested amount</dt>
      <dd>{formatCurrency(detail.requestedAmount)}</dd>
      <dt>Term</dt>
      <dd>{detail.termMonths} months</dd>
      <dt>Purpose</dt>
      <dd>{detail.purpose}</dd>
      <dt>Status</dt>
      <dd>{detail.status}</dd>
      <dt>Created</dt>
      <dd>{formatDateTime(detail.createdAt)}</dd>
      <dt>Submitted</dt>
      <dd>{formatDateTime(detail.submittedAt)}</dd>
    </dl>
  )
}

function MoneyTab({
  loanId,
  loan,
  loading,
  loansUseCases,
  onChanged
}: {
  loanId: string | null
  loan?: LoanDetails
  loading: boolean
  loansUseCases: ReturnType<typeof createLoansUseCases>
  onChanged: () => Promise<void>
}) {
  // null, not 0: an empty amount field is not a request to move R0. Separate
  // useFormErrors instances so a failed disbursement doesn't render an error
  // above the repayment form (both move money — see LoanDetailsPage rationale).
  const [disburseAmount, setDisburseAmount] = useState<number | null>(null)
  const [disburseReference, setDisburseReference] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState<number | null>(null)
  const [repaymentReference, setRepaymentReference] = useState('')
  const disburseForm = useFormErrors({ idPrefix: 'disburse' })
  const repaymentForm = useFormErrors({ idPrefix: 'repayment' })

  if (!loanId) {
    return (
      <EmptyState
        title="No loan yet"
        message="Once this case is approved and a loan is created, disbursement, repayments and the schedule appear here."
      />
    )
  }
  if (loading || !loan) return <p>Loading loan…</p>

  const outstanding = loan.outstandingPrincipal
  const totalDue = loan.schedule.reduce((sum, item) => sum + item.dueTotal, 0)

  function validateAmount(amount: number | null, max?: number): FieldErrorMap {
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return { amount: 'Enter an amount greater than zero.' }
    }
    if (max !== undefined && amount > max) {
      return { amount: `Amount exceeds the outstanding balance of ${formatCurrency(max)}.` }
    }
    return {}
  }

  async function onDisburse() {
    const result = await disburseForm.submit(
      () => loansUseCases.disburseLoan(loanId as string, disburseAmount as number, disburseReference),
      { validate: () => validateAmount(disburseAmount) }
    )
    if (result !== undefined) {
      setDisburseAmount(null)
      setDisburseReference('')
      await onChanged()
    }
  }

  async function onRecordRepayment() {
    const result = await repaymentForm.submit(
      () => loansUseCases.recordRepayment(loanId as string, repaymentAmount as number, repaymentReference),
      { validate: () => validateAmount(repaymentAmount, outstanding) }
    )
    if (result !== undefined) {
      setRepaymentAmount(null)
      setRepaymentReference('')
      await onChanged()
    }
  }

  return (
    <div className="stack-sm">
      <div className="grid-three">
        <article className="kpi-card"><p className="kpi-label">Outstanding</p><p className="kpi-value">{formatCurrency(outstanding)}</p></article>
        <article className="kpi-card"><p className="kpi-label">Principal</p><p className="kpi-value">{formatCurrency(loan.principalAmount)}</p></article>
        <article className="kpi-card"><p className="kpi-label">Scheduled Due</p><p className="kpi-value">{formatCurrency(totalDue)}</p></article>
      </div>
      <div className="grid-three">
        <article className="kpi-card"><p className="kpi-label">Interest Rate</p><p className="kpi-value">{Number(loan.interestRate).toFixed(2)}% p.a.</p></article>
        <article className="kpi-card"><p className="kpi-label">Term</p><p className="kpi-value">{loan.termMonths} months</p></article>
        <article className="kpi-card"><p className="kpi-label">Status</p><p className="kpi-value">{loan.status}</p></article>
      </div>

      <div className="grid-two">
        <article className="card form-grid">
          <h3>Disburse</h3>
          <div className="field-block">
            <label htmlFor={fieldDomId('amount', 'disburse')}>Amount</label>
            <NumericInput
              field="amount"
              idPrefix="disburse"
              mode="currency"
              min={0}
              value={disburseAmount}
              error={disburseForm.fieldErrors.amount}
              onChange={(next) => { setDisburseAmount(next); disburseForm.clearField('amount') }}
            />
            <FieldError field="amount" idPrefix="disburse" message={disburseForm.fieldErrors.amount} />
          </div>
          <div className="field-block">
            <label htmlFor={fieldDomId('reference', 'disburse')}>Reference</label>
            <input
              id={fieldDomId('reference', 'disburse')}
              {...fieldErrorAttrs('reference', disburseForm.fieldErrors.reference, 'disburse')}
              value={disburseReference}
              onChange={(event) => { setDisburseReference(event.target.value); disburseForm.clearField('reference') }}
            />
            <FieldError field="reference" idPrefix="disburse" message={disburseForm.fieldErrors.reference} />
          </div>
          <button className="btn" type="button" onClick={onDisburse} disabled={disburseForm.submitting}>
            {disburseForm.submitting ? 'Disbursing…' : 'Disburse'}
          </button>
          {disburseForm.formError ? <p className="text-error" role="alert">{disburseForm.formError}</p> : null}
        </article>

        <article className="card form-grid">
          <h3>Record repayment</h3>
          <div className="field-block">
            <label htmlFor={fieldDomId('amount', 'repayment')}>Amount</label>
            <NumericInput
              field="amount"
              idPrefix="repayment"
              mode="currency"
              min={0}
              value={repaymentAmount}
              error={repaymentForm.fieldErrors.amount}
              onChange={(next) => { setRepaymentAmount(next); repaymentForm.clearField('amount') }}
            />
            <FieldError field="amount" idPrefix="repayment" message={repaymentForm.fieldErrors.amount} />
          </div>
          <div className="field-block">
            <label htmlFor={fieldDomId('paymentReference', 'repayment')}>Payment reference</label>
            <input
              id={fieldDomId('paymentReference', 'repayment')}
              {...fieldErrorAttrs('paymentReference', repaymentForm.fieldErrors.paymentReference, 'repayment')}
              value={repaymentReference}
              onChange={(event) => { setRepaymentReference(event.target.value); repaymentForm.clearField('paymentReference') }}
            />
            <FieldError field="paymentReference" idPrefix="repayment" message={repaymentForm.fieldErrors.paymentReference} />
          </div>
          <button className="btn" type="button" onClick={onRecordRepayment} disabled={repaymentForm.submitting}>
            {repaymentForm.submitting ? 'Recording…' : 'Record'}
          </button>
          {repaymentForm.formError ? <p className="text-error" role="alert">{repaymentForm.formError}</p> : null}
        </article>
      </div>

      <div className="table-wrap">
        <h3>Repayment Schedule</h3>
        {loan.schedule.length ? (
          <table>
            <thead><tr><th>#</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
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
        ) : <EmptyState title="No schedule" message="No repayment schedule generated yet." />}
      </div>

      <div className="table-wrap">
        <h3>Repayments</h3>
        {loan.repayments.length ? (
          <table>
            <thead><tr><th>Date</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Reference</th></tr></thead>
            <tbody>
              {loan.repayments.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.paidAt)}</td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td>{formatCurrency(item.principalComponent)}</td>
                  <td>{formatCurrency(item.interestComponent)}</td>
                  <td>{item.paymentReference ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState title="No repayments" message="No repayments have been posted yet." />}
      </div>
    </div>
  )
}

function HistoryTab({ history, loading }: { history: StatusHistoryItem[]; loading: boolean }) {
  if (loading) return <p>Loading history…</p>
  if (!history.length) return <EmptyState title="No status history" message="Status changes will appear here." />
  return (
    <ol className="timeline">
      {history.map((item) => (
        <li key={item.id}>
          <p><strong>{item.fromStatus ?? 'None'}</strong> to <strong>{item.toStatus}</strong></p>
          <small>{formatDateTime(item.changedAt)}</small>
          {item.note ? <p>{item.note}</p> : null}
        </li>
      ))}
    </ol>
  )
}

