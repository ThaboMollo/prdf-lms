import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalculator } from '../../contexts/CalculatorContext'
import { calculateMonthlyInstalment, calculateTotalInterest, calculateTotalRepayment, formatRand } from '../../lib/loanCalc'
import { useActiveLoanProduct } from '../../lib/loanProduct'

// Slider granularity — a presentation choice, not a business rule, so it
// stays local rather than moving into loan_products alongside min/max/rate.
const AMOUNT_STEP = 50000

type LoanCalculatorProps = {
  compact?: boolean
  showApplyButton?: boolean
  applyLabel?: string
  /** If provided, called instead of navigating (used inside wizard) */
  onAmountChange?: (v: number) => void
  onTermChange?: (v: number) => void
}

function pct(value: number, min: number, max: number): string {
  if (max <= min) return '0%'
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
  const { amount, term, hasInteracted, setCalculator } = useCalculator()
  const { data: product } = useActiveLoanProduct()

  // Drafts let the typed value be edited freely; committed on blur/Enter.
  const [amountDraft, setAmountDraft] = useState<string | null>(null)
  const [termDraft, setTermDraft] = useState<string | null>(null)

  // Once the product loads, seed the slider to its minimum if the user
  // hasn't touched the calculator yet (replaces the old static LOAN_AMOUNT_MIN default).
  useEffect(() => {
    if (product && !hasInteracted) {
      setCalculator(product.minAmount, term)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  if (!product) {
    return <div className={compact ? '' : 'calculator-card'} aria-busy="true" />
  }

  const monthly = calculateMonthlyInstalment(amount, term, product.interestRate)
  const total = calculateTotalRepayment(amount, term, product.interestRate)
  const interest = calculateTotalInterest(amount, term, product.interestRate)
  const rateLabel = `${product.interestRate}% p.a.`

  function commitAmount(v: number) {
    const clamped = clamp(Math.round(v), product!.minAmount, product!.maxAmount)
    setCalculator(clamped, term)
    onAmountChange?.(clamped)
  }

  function commitTerm(v: number) {
    const clamped = clamp(Math.round(v), product!.minTermMonths, product!.maxTermMonths)
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
          min={product.minAmount}
          max={product.maxAmount}
          step={AMOUNT_STEP}
          value={amount}
          onChange={handleAmount}
          style={{ '--pct': pct(amount, product.minAmount, product.maxAmount) } as React.CSSProperties}
          aria-label="Loan amount"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          <span>{formatRand(product.minAmount)}</span>
          <span>{formatRand(product.maxAmount)}</span>
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
          min={product.minTermMonths}
          max={product.maxTermMonths}
          step={1}
          value={term}
          onChange={handleTerm}
          style={{ '--pct': pct(term, product.minTermMonths, product.maxTermMonths) } as React.CSSProperties}
          aria-label="Loan term in months"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          <span>{product.minTermMonths} month</span>
          <span>{product.maxTermMonths} months</span>
        </div>
      </div>

      <div className="calc-display">
        <div className="calc-metric calc-metric--highlight">
          <span className="calc-metric-label">Indicative first instalment</span>
          <span className="calc-metric-value">{formatRand(monthly)}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Indicative total repayment</span>
          <span className="calc-metric-value">{formatRand(total)}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Lending rate</span>
          <span className="calc-metric-value">{rateLabel}</span>
        </div>
        <div className="calc-metric">
          <span className="calc-metric-label">Estimated total interest</span>
          <span className="calc-metric-value">{formatRand(interest)}</span>
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
