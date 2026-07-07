import { formatRand } from '../../lib/loanCalc'
import { LENDING_RATE_LABEL } from '../../lib/loanLimits'

type WizardCostCardProps = {
  amount: number
  term: number
  monthly: number
  total: number
  fees: number
  onEdit: () => void
}

export function WizardCostCard({ amount, term, monthly, total, fees, onEdit }: WizardCostCardProps) {
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

        <div className="wizard-cost-card__row wizard-cost-card__row--monthly">
          <span className="wizard-cost-card__label">Indicative Monthly Payment</span>
          <span className="wizard-cost-card__monthly">{formatRand(monthly)}</span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Indicative Total Payable</span>
          <span className="wizard-cost-card__value">{formatRand(total)}</span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Estimated Finance Charge</span>
          <span className="wizard-cost-card__value">{formatRand(fees)}</span>
        </div>

        <div className="wizard-cost-card__row">
          <span className="wizard-cost-card__label">Lending Rate</span>
          <span className="wizard-cost-card__value">{LENDING_RATE_LABEL}</span>
        </div>
      </div>

      <button type="button" className="wizard-cost-card__edit" onClick={onEdit}>
        Edit loan details
      </button>
    </aside>
  )
}
