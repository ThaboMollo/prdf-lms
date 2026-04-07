import { createContext, useCallback, useContext, useState } from 'react'

type CalculatorState = {
  amount: number
  term: number
  setCalculator: (amount: number, term: number) => void
}

const SESSION_KEY = 'prdf_calc'

function readSession(): { amount: number; term: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.amount === 'number' && typeof parsed.term === 'number') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

const CalculatorContext = createContext<CalculatorState>({
  amount: 50000,
  term: 6,
  setCalculator: () => {}
})

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const saved = readSession()
  const [amount, setAmount] = useState(saved?.amount ?? 50000)
  const [term, setTerm] = useState(saved?.term ?? 6)

  const setCalculator = useCallback((newAmount: number, newTerm: number) => {
    setAmount(newAmount)
    setTerm(newTerm)
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ amount: newAmount, term: newTerm }))
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
