import { createContext, useCallback, useContext, useState } from 'react'

// No longer clamps against LOAN_AMOUNT_MIN/MAX — this context just stores
// amount/term for cross-page persistence. Clamping against the real product
// limits happens in LoanCalculator.tsx, where the product data is actually
// fetched (see useActiveLoanProduct() in lib/loanProduct.ts).

type CalculatorState = {
  amount: number
  term: number
  /** False once the user has actually touched the calculator (vs. still showing the initial placeholder). */
  hasInteracted: boolean
  setCalculator: (amount: number, term: number) => void
}

const SESSION_KEY = 'prdf_calc'
const DEFAULT_AMOUNT = 0
const DEFAULT_TERM = 6

function readSession(): { amount: number; term: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.amount === 'number' && typeof parsed.term === 'number') {
      return { amount: parsed.amount, term: parsed.term }
    }
    return null
  } catch {
    return null
  }
}

const CalculatorContext = createContext<CalculatorState>({
  amount: DEFAULT_AMOUNT,
  term: DEFAULT_TERM,
  hasInteracted: false,
  setCalculator: () => {}
})

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const saved = readSession()
  const [amount, setAmount] = useState(saved?.amount ?? DEFAULT_AMOUNT)
  const [term, setTerm] = useState(saved?.term ?? DEFAULT_TERM)
  const [hasInteracted, setHasInteracted] = useState(Boolean(saved))

  const setCalculator = useCallback((newAmount: number, newTerm: number) => {
    setAmount(newAmount)
    setTerm(newTerm)
    setHasInteracted(true)
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ amount: newAmount, term: newTerm }))
    } catch {
      // sessionStorage unavailable — silently ignore
    }
  }, [])

  return (
    <CalculatorContext value={{ amount, term, hasInteracted, setCalculator }}>
      {children}
    </CalculatorContext>
  )
}

export function useCalculator(): CalculatorState {
  return useContext(CalculatorContext)
}
