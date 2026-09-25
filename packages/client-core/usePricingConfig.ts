import { useQuery } from '@tanstack/react-query'
import { env } from '../../client-ui/src/lib/config/env'
import type { PricingConfig, RiskGrade } from '../domain/pricing'

/**
 * Fee structure and best-case lending rate from backend-node's
 * GET /api/pricing/public-config, so the client portal can price a loan with
 * the same engine (packages/domain/pricing.ts) the admin case page uses
 * instead of the old monthly-amortising approximation in loanCalc.ts.
 *
 * Shape matches PricingConfig exactly, so it feeds straight into quote().
 */
export type PublicPricingConfig = PricingConfig & {
  /** The grade indicativeAnnualRatePct is based on — the cheapest active one. */
  indicativeGrade: RiskGrade
  indicativeMarginPct: number
  indicativeAnnualRatePct: number
  /** Dearest active margin — the "Prime + up to X%" half of the disclosure. */
  maxMarginPct: number
  maxAnnualRatePct: number
}

const apiBaseUrl = env.VITE_API_BASE_URL

/**
 * Deliberately unauthenticated, exactly like useActiveLoanProduct(): this backs
 * the logged-out marketing calculator on LandingPage, so it must work with no
 * session. The endpoint returns no risk-grade ladder — only the fees an
 * applicant is told about anyway, plus the two ends of the margin spread that
 * the hero's rate disclosure is built from.
 */
export function usePublicPricingConfig() {
  return useQuery({
    queryKey: ['public-pricing-config'],
    queryFn: async (): Promise<PublicPricingConfig> => {
      const response = await fetch(`${apiBaseUrl}/api/pricing/public-config`)
      if (!response.ok) {
        throw new Error(`Failed to load pricing configuration: ${response.status}`)
      }
      return (await response.json()) as PublicPricingConfig
    },
    staleTime: 30 * 60 * 1000,
  })
}
