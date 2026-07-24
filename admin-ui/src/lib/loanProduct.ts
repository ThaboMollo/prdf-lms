import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * The loan product's amount/term/rate limits and required-document list,
 * fetched from loan_products / document_requirements instead of hardcoded
 * constants. Mirrors client-ui/src/lib/loanProduct.ts — duplicated rather
 * than shared, since there's no shared package yet (that's Phase 4).
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

type LoanProductRow = {
  id: string
  name: string
  min_amount: number | null
  max_amount: number | null
  min_term_months: number | null
  max_term_months: number | null
  interest_rate: number | null
}

function mapProductRow(row: LoanProductRow): LoanProduct {
  return {
    id: row.id,
    name: row.name,
    minAmount: Number(row.min_amount),
    maxAmount: Number(row.max_amount),
    minTermMonths: Number(row.min_term_months),
    maxTermMonths: Number(row.max_term_months),
    interestRate: Number(row.interest_rate),
  }
}

export function useActiveLoanProduct() {
  return useQuery({
    queryKey: ['active-loan-product'],
    queryFn: async (): Promise<LoanProduct> => {
      const { data, error } = await supabase
        .from('loan_products')
        .select('id, name, min_amount, max_amount, min_term_months, max_term_months, interest_rate')
        .eq('is_active', true)
        .limit(1)
        .single()

      if (error) throw new Error(error.message)
      return mapProductRow(data as LoanProductRow)
    },
    staleTime: 30 * 60 * 1000,
  })
}

export function useDocumentRequirements(loanProductId: string | undefined) {
  return useQuery({
    queryKey: ['document-requirements', loanProductId],
    queryFn: async (): Promise<DocumentRequirement[]> => {
      const { data, error } = await supabase
        .from('document_requirements')
        .select('doc_type, is_required, allows_multiple')
        .eq('loan_product_id', loanProductId)
        .eq('required_at_status', 'Submitted')

      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => ({
        docType: row.doc_type as string,
        isRequired: row.is_required as boolean,
        allowsMultiple: row.allows_multiple as boolean,
      }))
    },
    enabled: Boolean(loanProductId),
    staleTime: 30 * 60 * 1000,
  })
}
