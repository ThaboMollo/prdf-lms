import { createContext, useCallback, useContext, useState } from 'react'
import { LOAN_AMOUNT_MAX, LOAN_AMOUNT_MIN } from '../lib/loanLimits'

type CalculatorState = {
  amount: number
  term: number
  setCalculator: (amount: number, term: number) => void
}

const SESSION_KEY = 'prdf_calc'
const DEFAULT_AMOUNT = LOAN_AMOUNT_MIN
const DEFAULT_TERM = 6

function clampAmount(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_AMOUNT
  return Math.min(Math.max(value, LOAN_AMOUNT_MIN), LOAN_AMOUNT_MAX)
}

function readSession(): { amount: number; term: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.amount === 'number' && typeof parsed.term === 'number') {
      return { amount: clampAmount(parsed.amount), term: parsed.term }
    }
    return null
  } catch {
    return null
  }
}

const CalculatorContext = createContext<CalculatorState>({
  amount: DEFAULT_AMOUNT,
  term: DEFAULT_TERM,
  setCalculator: () => {}
})

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const saved = readSession()
  const [amount, setAmount] = useState(saved?.amount ?? DEFAULT_AMOUNT)
  const [term, setTerm] = useState(saved?.term ?? DEFAULT_TERM)

  const setCalculator = useCallback((newAmount: number, newTerm: number) => {
    const nextAmount = clampAmount(newAmount)
    setAmount(nextAmount)
    setTerm(newTerm)
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ amount: nextAmount, term: newTerm }))
    } catch {
      // sessionStorage unavailable — silently ignore
    }
  }, [])

  return (
    <CalculatorContext value={{ amount, term, setCalculator }}>
      {children}
    </CalculatorContext>
  )
}

export function useCalculator(): CalculatorState {
  return useContext(CalculatorContext)
}
