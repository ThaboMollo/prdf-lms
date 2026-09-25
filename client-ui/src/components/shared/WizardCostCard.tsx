import { formatRand } from '../../lib/loanCalc'
import type { IndicativeQuote } from '../../lib/creditQuote'

type WizardCostCardProps = {
  amount: number
  term: number
  /** Null until the public pricing config has loaded. */
  estimate: IndicativeQuote | null
  rateLabel: string
  onEdit: () => void
}

export function WizardCostCard({ amount, term, estimate, rateLabel, onEdit }: WizardCostCardProps) {
  return (
    <aside className="wizard-cost-card">
      <div className="wizard-cost-card__header">
        <span className="wizard-cost-card__title">Indicative Debt Breakdown</span>
      </div>

      <div className="wizard-cost-card__body">
        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Loan Amount</span>
          <span className="wizard-cost-card__value">{formatRand(amount)}</span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Term</span>
          <span className="wizard-cost-card__value">{term} months</span>
        </div>

        <div className="wizard-cost-card__divider" />

        {/*
          Bullet loan: capital and interest settle at maturity, so the headline
          figure is the total repayable, not a monthly instalment. Each once-off
          fee is listed rather than rolled into one "fees" line — the applicant
          is agreeing to them individually.
        */}
        <div className="wizard-cost-card__row wizard-cost-card__row--monthly">
          <span className="wizard-cost-card__label">Indicative Total Repayable</span>
          <span className="wizard-cost-card__monthly">
            {estimate ? formatRand(estimate.totalRepayable) : '—'}
          </span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">
            Interest{estimate ? ` (${estimate.daysFinanced} days)` : ''}
          </span>
          <span className="wizard-cost-card__value">
            {estimate ? formatRand(estimate.interest) : '—'}
          </span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Initiation Fee</span>
          <span className="wizard-cost-card__value">
            {estimate ? formatRand(estimate.initiationFee) : '—'}
          </span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Management Fee</span>
          <span className="wizard-cost-card__value">
            {estimate ? formatRand(estimate.managementFee) : '—'}
          </span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Lending Rate</span>
          <span className="wizard-cost-card__value">{rateLabel}</span>
        </div>
      </div>

      <button type="button" className="wizard-cost-card__edit" onClick={onEdit}>
        Edit loan details
      </button>
    </aside>
  )
}
