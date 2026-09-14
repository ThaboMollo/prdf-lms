import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { EmptyState } from '../../components/shared/EmptyState'
import { NumericInput } from '../../components/shared/NumericInput'
import { useToast } from '../../components/shared/ToastProvider'
import { formatCurrency } from '../../lib/format'
import { requestPricingQuote, ApiError } from '../../lib/api'
import type { QuoteBreakdown, RiskGrade } from '../../lib/api'

type CasePricingProps = {
  accessToken: string
  /** Prefill from the application's requested amount. */
  defaultAmount: number
}

const RISK_GRADES: { value: RiskGrade; label: string }[] = [
  { value: 'Low', label: 'Low' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'High', label: 'High' },
  { value: 'Worst', label: 'Worst' }
]

/**
 * Read-only credit-model pricing calculator (Phase 1). Computes interest, fees,
 * penalty and total client revenue from the shared engine — the server owns the
 * config values and risk-grade margins. Nothing here is persisted; the risk
 * grade is chosen for preview until Phase 2 stores the Risk Analyst's decision
 * on the application.
 */
export function CasePricing({ accessToken, defaultAmount }: CasePricingProps) {
  const toast = useToast()
  const [principal, setPrincipal] = useState<number>(defaultAmount || 0)
  const [daysFinanced, setDaysFinanced] = useState<number>(90)
  const [riskGrade, setRiskGrade] = useState<RiskGrade>('Low')
  const [daysLate, setDaysLate] = useState<number>(0)
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null)

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
