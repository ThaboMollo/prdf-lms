import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { NumericInput } from '../../components/shared/NumericInput'
import { useToast } from '../../components/shared/ToastProvider'
import { requestPricingQuote, saveRiskGrade, ApiError } from '../../lib/api'
import type { RiskGrade } from '../../lib/api'
import { RISK_GRADES, monthsToDays } from './CasePricing'

type DueDiligenceDecisionProps = {
  accessToken: string
  applicationId: string
  requestedAmount: number
  termMonths: number
  savedRiskGrade: RiskGrade | null
  savedRateOverride: number | null
  onSaved?: () => void
}

function formatRate(rate: number): string {
  return `${rate.toFixed(2)}% p.a.`
}

/**
 * The Risk Analyst's decision at Due Diligence (Admin Corrections V3): the
 * risk grade, and optionally the interest rate the case will be booked at.
 *
 * The calculated rate (prime + the grade's margin) is shown for reference; a
 * rate keyed in here overrides it. Both are stored on the application and
 * snapshotted onto the loan at Board sign-off. The server refuses to advance
 * the case to Evaluation until a grade is saved.
 */
export function DueDiligenceDecision({
  accessToken,
  applicationId,
  requestedAmount,
  termMonths,
  savedRiskGrade,
  savedRateOverride,
  onSaved
}: DueDiligenceDecisionProps) {
  const toast = useToast()
  const [riskGrade, setRiskGrade] = useState<RiskGrade | ''>(savedRiskGrade ?? '')
  const [rateOverride, setRateOverride] = useState<number | null>(savedRateOverride)

  const calculatedQuery = useQuery({
    queryKey: ['dd-calculated-rate', applicationId, riskGrade, requestedAmount, termMonths],
    queryFn: () =>
      requestPricingQuote(accessToken, {
        principal: requestedAmount,
        daysFinanced: monthsToDays(termMonths || 12),
        riskGrade: riskGrade as RiskGrade
      }),
    enabled: Boolean(riskGrade) && requestedAmount > 0
  })
  const calculatedRate = calculatedQuery.data?.annualRatePct ?? null

  const saveMutation = useMutation({
    // null, not undefined: an emptied override field must clear the stored one.
    mutationFn: () => saveRiskGrade(accessToken, applicationId, riskGrade as RiskGrade, rateOverride ?? null),
    onSuccess: (result) => {
      toast.push(
        result.interestRateOverride != null
          ? `Saved: ${result.riskGrade} risk at ${formatRate(result.interestRateOverride)}.`
          : `Saved: ${result.riskGrade} risk at the calculated rate.`,
        'success'
      )
      onSaved?.()
    },
    onError: (error) =>
      toast.push(error instanceof ApiError ? error.message : 'Could not save the risk decision.', 'error')
  })

  const overrideValid = rateOverride == null || (rateOverride > 0 && rateOverride <= 100)
  const dirty = riskGrade !== (savedRiskGrade ?? '') || rateOverride !== savedRateOverride
  const bookedRate = rateOverride ?? calculatedRate

  return (
    <div className="card stack-sm">
      <h3>Risk decision</h3>
      <label>
        Risk grade
        <select value={riskGrade} onChange={(event) => setRiskGrade(event.target.value as RiskGrade)}>
          <option value="">— select risk grade —</option>
          {RISK_GRADES.map((grade) => (
            <option key={grade.value} value={grade.value}>{grade.label}</option>
          ))}
        </select>
      </label>
      <p className="muted-text">
        Calculated rate:{' '}
        {!riskGrade
          ? 'select a grade'
          : calculatedQuery.isLoading
            ? 'calculating…'
            : calculatedRate != null
              ? formatRate(calculatedRate)
              : 'unavailable'}
      </p>
      <label>
        Interest rate override (% p.a.)
        <NumericInput
          field="interestRatePct"
          idPrefix="dd"
          mode="decimal"
          min={0}
          max={100}
          value={rateOverride}
          onChange={setRateOverride}
          placeholder={calculatedRate != null ? calculatedRate.toFixed(2) : 'Optional'}
          error={overrideValid ? undefined : 'Enter a rate above 0 and up to 100.'}
        />
      </label>
      {!overrideValid ? <p className="text-error" role="alert">Enter a rate above 0 and up to 100.</p> : null}
      <p className="muted-text">
        {bookedRate != null
          ? `The loan will be booked at ${formatRate(bookedRate)}${rateOverride != null ? ' (overridden)' : ''}.`
          : 'Leave the override blank to book at the calculated rate.'}
      </p>
      <button
        className="btn"
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={!riskGrade || !overrideValid || !dirty || saveMutation.isPending}
      >
        {saveMutation.isPending ? 'Saving…' : dirty ? 'Save risk decision' : 'Risk decision saved'}
      </button>
    </div>
  )
}
