import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { PaginationControls } from '../components/shared/PaginationControls'
import { formatCurrency, formatDateTime } from '../lib/format'
import { paginateItems, parsePageParam } from '../lib/pagination'
import { createLoansUseCases } from '../logic/usecases/loans'
import { useFormErrors, FieldError, fieldErrorAttrs, fieldDomId, type FieldErrorMap } from '../hooks/useFormErrors'

type LoanDetailsPageProps = {
  session: Session
}

const SCHEDULE_PAGE_SIZE = 12
const REPAYMENTS_PAGE_SIZE = 12

export function LoanDetailsPage({ session }: LoanDetailsPageProps) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { loanId } = useParams<{ loanId: string }>()
  const accessToken = session.access_token
  const loansUseCases = useMemo(() => createLoansUseCases(accessToken), [accessToken])
  const [disburseAmount, setDisburseAmount] = useState(0)
  const [disburseReference, setDisburseReference] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState(0)
  const [repaymentReference, setRepaymentReference] = useState('')

  // One instance per form. They previously shared a single `formError`, so a
  // failed disbursement rendered a red message above the repayment form too —
  // on a page where both actions move money, that is genuinely misleading.
  //
  // Both DTOs name the field `amount`, so the DOM ids are namespaced; the error
  // keys stay `amount`, matching what the server reports.
  const disburseForm = useFormErrors({ idPrefix: 'disburse' })
  const repaymentForm = useFormErrors({ idPrefix: 'repayment' })

  const schedulePage = parsePageParam(params.get('schedulePage'))
  const repaymentsPage = parsePageParam(params.get('repaymentsPage'))

  const loanQuery = useQuery({
    queryKey: ['loan-details', loanId],
    queryFn: () => loansUseCases.getLoan(loanId!),
    enabled: Boolean(loanId)
  })

  // Local checks mirroring the DTOs (@IsNumber @IsPositive on `amount`). The
  // server remains the control — this only saves a round trip. The key must be
  // `amount`, matching the DTO property, so a client rejection and a server
  // rejection land on the same input.
  function validateAmount(amount: number, outstanding?: number): FieldErrorMap {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { amount: 'Enter an amount greater than zero.' }
    }
    if (outstanding !== undefined && amount > outstanding) {
      return { amount: `Amount exceeds the outstanding balance of ${formatCurrency(outstanding)}.` }
    }
    return {}
  }

  async function onDisburse() {
    const result = await disburseForm.submit(
      () => loansUseCases.disburseLoan(loanId!, disburseAmount, disburseReference),
      { validate: () => validateAmount(disburseAmount) }
    )
    if (result !== undefined) {
      await queryClient.invalidateQueries({ queryKey: ['loan-details', loanId] })
    }
  }

  async function onRecordRepayment() {
    const result = await repaymentForm.submit(
      () => loansUseCases.recordRepayment(loanId!, repaymentAmount, repaymentReference),
      { validate: () => validateAmount(repaymentAmount, loanQuery.data?.outstandingPrincipal) }
    )
    if (result !== undefined) {
      await queryClient.invalidateQueries({ queryKey: ['loan-details', loanId] })
    }
  }

  const totalDue = useMemo(() => loanQuery.data?.schedule.reduce((sum, item) => sum + item.dueTotal, 0) ?? 0, [loanQuery.data])

  const pagedSchedule = useMemo(
    () => paginateItems(loanQuery.data?.schedule ?? [], schedulePage, SCHEDULE_PAGE_SIZE),
    [loanQuery.data?.schedule, schedulePage]
  )

  const pagedRepayments = useMemo(
    () => paginateItems(loanQuery.data?.repayments ?? [], repaymentsPage, REPAYMENTS_PAGE_SIZE),
    [loanQuery.data?.repayments, repaymentsPage]
  )

  if (!loanId) {
    return (
      <section className="stack">
        <PageHeader title="Loan Details" subtitle="No loan ID specified." />
        <EmptyState title="No loan selected" message="Navigate to a loan from the Applications page." />
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader title="Loan Details" subtitle={`Loan ID: ${loanId}`} />

      {loanQuery.isError ? <p className="text-error">Unable to load loan details.</p> : null}

      {loanQuery.data ? (
        <>
          <div className="grid-three">
            <article className="kpi-card"><p className="kpi-label">Status</p><p className="kpi-value">{loanQuery.data.status}</p></article>
            <article className="kpi-card"><p className="kpi-label">Outstanding</p><p className="kpi-value">{formatCurrency(loanQuery.data.outstandingPrincipal)}</p></article>
            <article className="kpi-card"><p className="kpi-label">Scheduled Due</p><p className="kpi-value">{formatCurrency(totalDue)}</p></article>
          </div>

          <div className="grid-three">
            <article className="kpi-card"><p className="kpi-label">Principal</p><p className="kpi-value">{formatCurrency(loanQuery.data.principalAmount)}</p></article>
            <article className="kpi-card"><p className="kpi-label">Interest Rate</p><p className="kpi-value">{Number(loanQuery.data.interestRate).toFixed(2)}% p.a.</p></article>
            <article className="kpi-card"><p className="kpi-label">Term</p><p className="kpi-value">{loanQuery.data.termMonths} months</p></article>
          </div>

          <div className="grid-two">
            {/* The amount inputs are NOT wrapped in their <label> any more: a
                label's contents become part of the input's accessible name, so
                a nested error would rename the field and be announced twice. */}
            <article className="card form-grid">
              <h2>Disburse Loan</h2>
              <div className="field-block">
                <label htmlFor={fieldDomId('amount', 'disburse')}>Amount</label>
                <input
                  id={fieldDomId('amount', 'disburse')}
                  {...fieldErrorAttrs('amount', disburseForm.fieldErrors.amount, 'disburse')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={disburseAmount}
                  onChange={(e) => { setDisburseAmount(Number(e.target.value)); disburseForm.clearField('amount') }}
                />
                <FieldError field="amount" idPrefix="disburse" message={disburseForm.fieldErrors.amount} />
              </div>
              <div className="field-block">
                <label htmlFor={fieldDomId('reference', 'disburse')}>Reference</label>
                <input
                  id={fieldDomId('reference', 'disburse')}
                  {...fieldErrorAttrs('reference', disburseForm.fieldErrors.reference, 'disburse')}
                  value={disburseReference}
                  onChange={(e) => { setDisburseReference(e.target.value); disburseForm.clearField('reference') }}
                />
                <FieldError field="reference" idPrefix="disburse" message={disburseForm.fieldErrors.reference} />
              </div>
              {/* The button is no longer disabled on a zero amount. Disabling it
                  told the user nothing about why; submitting and showing the
                  reason on the field does. */}
              <button className="btn" type="button" onClick={onDisburse} disabled={disburseForm.submitting}>
                {disburseForm.submitting ? 'Disbursing...' : 'Disburse'}
              </button>
              {disburseForm.formError ? <p className="text-error" role="alert">{disburseForm.formError}</p> : null}
            </article>

            <article className="card form-grid">
              <h2>Record Repayment</h2>
              <div className="field-block">
                <label htmlFor={fieldDomId('amount', 'repayment')}>Amount</label>
                <input
                  id={fieldDomId('amount', 'repayment')}
                  {...fieldErrorAttrs('amount', repaymentForm.fieldErrors.amount, 'repayment')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={repaymentAmount}
                  onChange={(e) => { setRepaymentAmount(Number(e.target.value)); repaymentForm.clearField('amount') }}
                />
                <FieldError field="amount" idPrefix="repayment" message={repaymentForm.fieldErrors.amount} />
              </div>
              <div className="field-block">
                <label htmlFor={fieldDomId('paymentReference', 'repayment')}>Payment reference</label>
                <input
                  id={fieldDomId('paymentReference', 'repayment')}
                  {...fieldErrorAttrs('paymentReference', repaymentForm.fieldErrors.paymentReference, 'repayment')}
                  value={repaymentReference}
                  onChange={(e) => { setRepaymentReference(e.target.value); repaymentForm.clearField('paymentReference') }}
                />
                <FieldError field="paymentReference" idPrefix="repayment" message={repaymentForm.fieldErrors.paymentReference} />
              </div>
              <button className="btn" type="button" onClick={onRecordRepayment} disabled={repaymentForm.submitting}>
                {repaymentForm.submitting ? 'Recording...' : 'Record'}
              </button>
              {repaymentForm.formError ? <p className="text-error" role="alert">{repaymentForm.formError}</p> : null}
            </article>
          </div>

          <div className="card table-wrap">
            <h2>Repayment Schedule</h2>
            {loanQuery.data.schedule.length ? (
              <>
                <table>
                  <thead><tr><th>#</th><th>Due Date</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {pagedSchedule.items.map((item) => (
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
                <PaginationControls
                  page={pagedSchedule.page}
                  totalPages={pagedSchedule.totalPages}
                  onPageChange={(nextPage) => {
                    const next = new URLSearchParams(params)
                    next.set('schedulePage', String(nextPage))
                    setParams(next)
                  }}
                />
              </>
            ) : <EmptyState title="No schedule" message="No repayment schedule generated yet." />}
          </div>

          <div className="card table-wrap">
            <h2>Repayments</h2>
            {loanQuery.data.repayments.length ? (
              <>
                <table>
                  <thead><tr><th>Date</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Reference</th></tr></thead>
                  <tbody>
                    {pagedRepayments.items.map((item) => (
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
                <PaginationControls
                  page={pagedRepayments.page}
                  totalPages={pagedRepayments.totalPages}
                  onPageChange={(nextPage) => {
                    const next = new URLSearchParams(params)
                    next.set('repaymentsPage', String(nextPage))
                    setParams(next)
                  }}
                />
              </>
            ) : <EmptyState title="No repayments" message="No repayments have been posted yet." />}
          </div>
        </>
      ) : loanQuery.isLoading ? <p>Loading loan...</p> : null}
    </section>
  )
}
