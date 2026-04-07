import { useNavigate } from 'react-router-dom'
import { useCalculator } from '../../contexts/CalculatorContext'
import {
  calculateMonthlyInstalment,
  calculateTotalFees,
  calculateTotalRepayment,
  formatRand,
} from '../../lib/loanCalc'

const AMOUNT_MIN = 10000
const AMOUNT_MAX = 500000
const TERM_MIN = 1
const TERM_MAX = 24

type LoanCalculatorProps = {
  compact?: boolean
  showApplyButton?: boolean
  applyLabel?: string
  /** If provided, called instead of navigating (used inside wizard) */
  onAmountChange?: (v: number) => void
  onTermChange?: (v: number) => void
}

function pct(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`
}

export function LoanCalculator({
  compact = false,
  showApplyButton = true,
  applyLabel = 'Apply Now',
  onAmountChange,
  onTermChange,
}: LoanCalculatorProps) {
  const navigate = useNavigate()
  const { amount, term, setCalculator } = useCalculator()

  const monthly = calculateMonthlyInstalment(amount, term)
  const total = calculateTotalRepayment(amount, term)
  const fees = calculateTotalFees(amount, term)

  function handleAmount(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value)
    setCalculator(v, term)
    onAmountChange?.(v)
  }

  function handleTerm(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value)
    setCalculator(amount, v)
    onTermChange?.(v)
  }

  return (
    <div className={compact ? '' : 'calculator-card'}>
      {!compact && <h2>Get an instant estimate</h2>}

      <div className="calc-field">
        <label>
          How much do you need?
          <span>{formatRand(amount)}</span>
        </label>
        <input
          type="range"
          min={AMOUNT_MIN}
          max={AMOUNT_MAX}
          step={5000}
          value={amount}
          onChange={handleAmount}
          style={{ '--pct': pct(amount, AMOUNT_MIN, AMOUNT_MAX) } as React.CSSProperties}
          aria-label="Loan amount"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          <span>{formatRand(AMOUNT_MIN)}</span>
          <span>{formatRand(AMOUNT_MAX)}</span>
        </div>
      </div>

      <div className="calc-field">
        <label>
          Over how many months?
          <span>{term} month{term !== 1 ? 's' : ''}</span>
        </label>
        <input
          type="range"
          min={TERM_MIN}
          max={TERM_MAX}
          step={1}
          value={term}
          onChange={handleTerm}
          style={{ '--pct': pct(term, TERM_MIN, TERM_MAX) } as React.CSSProperties}
          aria-label="Loan term in months"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          <span>{TERM_MIN} month</span>
          <span>{TERM_MAX} months</span>
        </div>
      </div>

      <div className="calc-display">
        <div className="calc-metric">
          <span className="calc-metric-label">Monthly</span>
          <span className="calc-metric-value highlight">{formatRand(monthly)}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Total repayment</span>
          <span className="calc-metric-value">{formatRand(total)}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Total fees</span>
          <span className="calc-metric-value">{formatRand(fees)}</span>
        </div>
      </div>

      {showApplyButton && (
        <button
          type="button"
          className="btn-cta"
          style={{ width: '100%', textAlign: 'center' }}
          onClick={() => navigate('/register')}
        >
          {applyLabel}
        </button>
      )}
    </div>
  )
}
