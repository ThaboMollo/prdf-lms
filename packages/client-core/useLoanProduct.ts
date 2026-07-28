import { useQuery } from '@tanstack/react-query'
import { env } from '../../client-ui/src/lib/config/env'

/**
 * The loan product's amount/term/rate limits and required-document list,
 * fetched from backend-node's /api/loan-products and /api/document-requirements
 * (previously direct Supabase reads).
 *
 * PRDF has exactly one active product today, so this always resolves that
 * single row. A client with multiple products would need the caller to
 * pass a specific product id — out of scope until that's a real need.
 */
export type LoanProduct = {
  id: string
  name: string
  minAmount: number
  maxAmount: number
  minTermMonths: number
  maxTermMonths: number
  interestRate: number
}

export type DocumentRequirement = {
  docType: string
  isRequired: boolean
  allowsMultiple: boolean
}

type LoanProductResponse = {
  id: string
  name: string
  minAmount: number | null
  maxAmount: number | null
  minTermMonths: number | null
  maxTermMonths: number | null
  interestRate: number | null
}

type DocumentRequirementResponse = {
  docType: string
  isRequired: boolean
  allowsMultiple: boolean
}

const apiBaseUrl = env.VITE_API_BASE_URL

function mapProduct(row: LoanProductResponse): LoanProduct {
  return {
    id: row.id,
    name: row.name,
    minAmount: Number(row.minAmount),
    maxAmount: Number(row.maxAmount),
    minTermMonths: Number(row.minTermMonths),
    maxTermMonths: Number(row.maxTermMonths),
    interestRate: Number(row.interestRate),
  }
}

/**
 * The single active loan product. Deliberately unauthenticated — backs the
 * logged-out public marketing calculator (LandingPage/LoanCalculator), so
 * this must work with no session. backend-node's GET /api/loan-products/active
 * is intentionally public to match (mirrors the DB's own anon-readable RLS
 * scope for this one row).
 */
export function useActiveLoanProduct() {
  return useQuery({
    queryKey: ['active-loan-product'],
    queryFn: async (): Promise<LoanProduct> => {
      const response = await fetch(`${apiBaseUrl}/api/loan-products/active`)
      if (!response.ok) {
        throw new Error(`Failed to load active loan product: ${response.status}`)
      }
      return mapProduct((await response.json()) as LoanProductResponse)
    },
    staleTime: 30 * 60 * 1000,
  })
}

/** Required documents for a given product — requires an authenticated session (RLS is `to authenticated` only, unchanged). */
export function useDocumentRequirements(loanProductId: string | undefined, accessToken: string | undefined) {
  return useQuery({
    queryKey: ['document-requirements', loanProductId],
    queryFn: async (): Promise<DocumentRequirement[]> => {
      const response = await fetch(`${apiBaseUrl}/api/document-requirements?productId=${encodeURIComponent(loanProductId!)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (!response.ok) {
        throw new Error(`Failed to load document requirements: ${response.status}`)
      }
      const rows = (await response.json()) as DocumentRequirementResponse[]
      return rows.map((row) => ({
        docType: row.docType,
        isRequired: row.isRequired,
        allowsMultiple: row.allowsMultiple,
      }))
    },
    enabled: Boolean(loanProductId) && Boolean(accessToken),
    staleTime: 30 * 60 * 1000,
  })
}
