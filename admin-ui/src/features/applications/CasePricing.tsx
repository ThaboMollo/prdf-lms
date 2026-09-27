import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { EmptyState } from '../../components/shared/EmptyState'
import { NumericInput } from '../../components/shared/NumericInput'
import { useToast } from '../../components/shared/ToastProvider'
import { formatCurrency } from '../../lib/format'
import { requestPricingQuote, saveRiskGrade, ApiError } from '../../lib/api'
import type { QuoteBreakdown, RiskGrade } from '../../lib/api'

type CasePricingProps = {
  accessToken: string
  applicationId: string
  /** Prefill from the application's requested amount. */
  defaultAmount: number
  /** Prefill days financed from the application's term. */
  termMonths: number
  /** The grade already stored on the application, if the Risk Analyst has graded it. */
  savedRiskGrade: RiskGrade | null
  /** Once a loan exists its rate is a snapshot and the grade is locked. */
  hasBookedLoan: boolean
  onRiskGradeSaved?: (grade: RiskGrade) => void
}

/**
 * Months -> days, matching the server (PricingService.monthsToDays) and the
 * client portal exactly. Defaulting this from the application's term matters:
 * the field used to open at a flat 90 regardless, so pricing a 12-month loan
 * without noticing quoted a quarter's interest.
 */
const DAYS_PER_YEAR = 365
function monthsToDays(months: number): number {
  return Math.round(months * (DAYS_PER_YEAR / 12))
}

const RISK_GRADES: { value: RiskGrade; label: string }[] = [
  { value: 'Low', label: 'Low' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'High', label: 'High' },
  { value: 'Worst', label: 'Worst' }
]

/**
 * Credit-model pricing for a case: quote preview, plus the Risk Analyst's
 * grade decision.
 *
 * The quote itself is read-only arithmetic from the shared engine (the server
 * owns the config values and grade margins). Saving the grade is the part that
 * carries: it is stored on the application and is what the loan is booked at
 * when the case reaches Approved. Before Phase 2 the grade was preview-only,
 * so staff priced a case at one rate and the client was booked at the legacy
 * flat product rate instead.
 */
export function CasePricing({
  accessToken,
  applicationId,
  defaultAmount,
  termMonths,
  savedRiskGrade,
  hasBookedLoan,
  onRiskGradeSaved
}: CasePricingProps) {
  const toast = useToast()
  const [principal, setPrincipal] = useState<number>(defaultAmount || 0)
  const [daysFinanced, setDaysFinanced] = useState<number>(monthsToDays(termMonths || 12))
  const [riskGrade, setRiskGrade] = useState<RiskGrade>(savedRiskGrade ?? 'Low')
  const [daysLate, setDaysLate] = useState<number>(0)
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null)
  const [storedGrade, setStoredGrade] = useState<RiskGrade | null>(savedRiskGrade)

  const saveGradeMutation = useMutation({
    mutationFn: () => saveRiskGrade(accessToken, applicationId, riskGrade),
    onSuccess: (result) => {
      setStoredGrade(result.riskGrade)
      onRiskGradeSaved?.(result.riskGrade)
      toast.push(`Risk grade saved as ${result.riskGrade}. The loan will be booked at this grade.`, 'success')
    },
    onError: (error) =>
      toast.push(
        error instanceof ApiError ? error.message : 'Could not save the risk grade.',
        'error'
      )
  })

  const quoteMutation = useMutation({
    mutationFn: () =>
      requestPricingQuote(accessToken, {
        principal,
        daysFinanced,
        riskGrade,
        daysLate: daysLate || 0
      }),
    onSuccess: (result) => setQuote(result),
    onError: (error) =>
      toast.push(
        error instanceof ApiError ? error.message : 'Could not calculate the quote.',
        'error'
      )
  })

  const canCalculate = principal > 0 && daysFinanced > 0

  return (
    <div className="stack-sm">
      <div className="form-grid">
        <label>
          Principal (R)
          <NumericInput field="principal" idPrefix="pricing" mode="currency" min={0} value={principal} onChange={(v) => setPrincipal(v ?? 0)} />
        </label>
        <label>
          Days financed
          <NumericInput field="daysFinanced" idPrefix="pricing" mode="integer" min={0} value={daysFinanced} onChange={(v) => setDaysFinanced(v ?? 0)} />
        </label>
        <label>
          Risk grade
          <select value={riskGrade} onChange={(event) => setRiskGrade(event.target.value as RiskGrade)}>
            {RISK_GRADES.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Days late (optional)
          <NumericInput field="daysLate" idPrefix="pricing" mode="integer" min={0} value={daysLate} onChange={(v) => setDaysLate(v ?? 0)} />
        </label>
        <button
          className="btn"
          type="button"
          onClick={() => quoteMutation.mutate()}
          disabled={quoteMutation.isPending || !canCalculate}
        >
          {quoteMutation.isPending ? 'Calculating…' : 'Calculate quote'}
        </button>
      </div>

      <div className="risk-grade-decision">
        <div>
          <strong>Risk grade decision</strong>
          <p className="muted-text">
            {hasBookedLoan
              ? `This case is booked at ${storedGrade ?? 'the legacy product rate'}. The grade is now fixed — a booked loan keeps the rate it was priced on.`
              : storedGrade
                ? `Saved as ${storedGrade}. The loan will be booked at this grade when the case is approved.`
                : 'Not graded yet. Save a grade before approving, or the loan falls back to the legacy product rate.'}
          </p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => saveGradeMutation.mutate()}
          disabled={hasBookedLoan || saveGradeMutation.isPending || storedGrade === riskGrade}
        >
          {saveGradeMutation.isPending
            ? 'Saving…'
            : storedGrade === riskGrade
              ? 'Grade saved'
              : `Save grade as ${riskGrade}`}
        </button>
      </div>

      {quote ? (
        <>
          <table className="data-table">
            <tbody>
              <tr>
                <td>Annual rate</td>
                <td style={{ textAlign: 'right' }}>{quote.annualRatePct.toFixed(2)}%</td>
              </tr>
              <tr>
                <td>Interest</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(quote.interest)}</td>
              </tr>
              <tr>
                <td>Initiation fee</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(quote.initiationFee)}</td>
              </tr>
              <tr>
                <td>Management fee</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(quote.managementFee)}</td>
              </tr>
              <tr>
                <td>Penalty{daysLate ? ` (${daysLate} days late)` : ''}</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(quote.penalty)}</td>
              </tr>
              <tr>
                <td>Total due to funder <small>(principal + interest, excl. fees)</small></td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(quote.totalDueToFunder)}</td>
              </tr>
              <tr>
                <td>Total fees</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(quote.totalFees)}</td>
              </tr>
              <tr>
                <td><strong>Total client revenue</strong> <small>(excl. capital)</small></td>
                <td style={{ textAlign: 'right' }}><strong>{formatCurrency(quote.totalClientRevenue)}</strong></td>
              </tr>
            </tbody>
          </table>

          <h4>Late-payment scenarios</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Days late</th>
                <th style={{ textAlign: 'right' }}>Penalty</th>
                <th style={{ textAlign: 'right' }}>Total revenue</th>
              </tr>
            </thead>
            <tbody>
              {quote.latePaymentScenarios.map((scenario) => (
                <tr key={scenario.daysLate}>
                  <td>{scenario.daysLate}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(scenario.penalty)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(scenario.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <EmptyState
          title="No quote yet"
          message="Enter the loan terms and risk grade, then calculate the credit-model breakdown."
        />
      )}
    </div>
  )
}
