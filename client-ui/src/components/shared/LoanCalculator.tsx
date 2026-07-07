import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalculator } from '../../contexts/CalculatorContext'
import {
  calculateMonthlyInstalment,
  calculateTotalFees,
  calculateTotalRepayment,
  formatRand,
} from '../../lib/loanCalc'
import {
  LOAN_AMOUNT_MAX,
  LOAN_AMOUNT_MIN,
  LOAN_AMOUNT_STEP,
  LOAN_TERM_MAX,
  LOAN_TERM_MIN,
  LENDING_RATE_LABEL,
} from '../../lib/loanLimits'


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

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
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

  // Drafts let the typed value be edited freely; committed on blur/Enter.
  const [amountDraft, setAmountDraft] = useState<string | null>(null)
  const [termDraft, setTermDraft] = useState<string | null>(null)

  const monthly = calculateMonthlyInstalment(amount, term)
  const total = calculateTotalRepayment(amount, term)
  const fees = calculateTotalFees(amount, term)

  function commitAmount(v: number) {
    const clamped = clamp(Math.round(v), LOAN_AMOUNT_MIN, LOAN_AMOUNT_MAX)
    setCalculator(clamped, term)
    onAmountChange?.(clamped)
  }

  function commitTerm(v: number) {
    const clamped = clamp(Math.round(v), LOAN_TERM_MIN, LOAN_TERM_MAX)
    setCalculator(amount, clamped)
    onTermChange?.(clamped)
  }

  function handleAmount(e: React.ChangeEvent<HTMLInputElement>) {
    commitAmount(Number(e.target.value))
  }

  function handleTerm(e: React.ChangeEvent<HTMLInputElement>) {
    commitTerm(Number(e.target.value))
  }

  return (
    <div className={compact ? '' : 'calculator-card'}>
      {!compact && <h2>Get an indicative estimate</h2>}

      <div className="calc-field">
        <label>
          How much do you need?
          <input
            type="text"
            inputMode="numeric"
            className="calc-value-input"
            value={amountDraft ?? formatRand(amount)}
            onFocus={() => setAmountDraft(String(amount))}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '')
              setAmountDraft(digits)
              if (digits) commitAmount(Number(digits))
            }}
            onBlur={() => {
              if (amountDraft !== null) commitAmount(Number(amountDraft))
              setAmountDraft(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            aria-label="Loan amount in rand"
          />
        </label>
        <input
          type="range"
          min={LOAN_AMOUNT_MIN}
          max={LOAN_AMOUNT_MAX}
          step={LOAN_AMOUNT_STEP}
          value={amount}
          onChange={handleAmount}
          style={{ '--pct': pct(amount, LOAN_AMOUNT_MIN, LOAN_AMOUNT_MAX) } as React.CSSProperties}
          aria-label="Loan amount"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          <span>{formatRand(LOAN_AMOUNT_MIN)}</span>
          <span>{formatRand(LOAN_AMOUNT_MAX)}</span>
        </div>
      </div>

      <div className="calc-field">
        <label>
          Over how many months?
          <input
            type="text"
            inputMode="numeric"
            className="calc-value-input"
            value={termDraft ?? `${term} month${term !== 1 ? 's' : ''}`}
            onFocus={() => setTermDraft(String(term))}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '')
              setTermDraft(digits)
              if (digits) commitTerm(Number(digits))
            }}
            onBlur={() => {
              if (termDraft !== null) commitTerm(Number(termDraft))
              setTermDraft(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            aria-label="Loan term in months"
          />
        </label>
        <input
          type="range"
          min={LOAN_TERM_MIN}
          max={LOAN_TERM_MAX}
          step={1}
          value={term}
          onChange={handleTerm}
          style={{ '--pct': pct(term, LOAN_TERM_MIN, LOAN_TERM_MAX) } as React.CSSProperties}
          aria-label="Loan term in months"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          <span>{LOAN_TERM_MIN} month</span>
          <span>{LOAN_TERM_MAX} months</span>
        </div>
      </div>

      <div className="calc-display">
        <div className="calc-metric calc-metric--highlight">
          <span className="calc-metric-label">Indicative monthly repayment</span>
          <span className="calc-metric-value">{formatRand(monthly)}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Indicative total repayment</span>
          <span className="calc-metric-value">{formatRand(total)}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Lending rate</span>
          <span className="calc-metric-value">{LENDING_RATE_LABEL}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Estimated finance charge</span>
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
