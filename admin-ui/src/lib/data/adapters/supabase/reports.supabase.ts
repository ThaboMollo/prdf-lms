import type { ArrearsItem, PortfolioSummary } from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { ReportsRepository } from '../../repositories/reports.repo'

type LoanRow = {
  id: string
  principal_amount: number
  outstanding_principal: number
  status: string
}

type ArrearsRow = {
  loan_id: string
  installment_no: number
  due_date: string
  due_total: number
  paid_amount: number
  loan: { application_id: string }[] | null
}

export function createSupabaseReportsAdapter(accessToken: string): ReportsRepository {
  const client = createSupabaseDataClient(accessToken)

  return {
    async getPortfolioSummary(): Promise<PortfolioSummary> {
      const { data, error } = await client
        .from('loans')
        .select('id, principal_amount, outstanding_principal, status')

      if (error) {
        throw new Error(`Supabase portfolio summary failed: ${error.message}`)
      }

      const rows = (data ?? []) as LoanRow[]
      const totalLoans = rows.length
      const activeLoans = rows.filter((r) => r.status !== 'Closed').length
      const totalPrincipal = rows.reduce((sum, r) => sum + Number(r.principal_amount), 0)
      const outstandingPrincipal = rows.reduce((sum, r) => sum + Number(r.outstanding_principal), 0)
      const repaidPrincipal = totalPrincipal - outstandingPrincipal

      return {
        totalLoans,
        activeLoans,
        totalPrincipal,
        outstandingPrincipal,
        repaidPrincipal
      }
    },
    async getArrears(): Promise<ArrearsItem[]> {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await client
        .from('repayment_schedule')
        .select('loan_id, installment_no, due_date, due_total, paid_amount, loan:loans(application_id)')
        .lt('due_date', today)
        .order('due_date', { ascending: true })

      if (error) {
        throw new Error(`Supabase arrears query failed: ${error.message}`)
      }

      const now = Date.now()
      return ((data ?? []) as ArrearsRow[])
        .map((row) => {
          const outstandingAmount = Number(row.due_total) - Number(row.paid_amount)
          const daysOverdue = Math.max(0, Math.floor((now - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24)))
          return {
            loanId: row.loan_id,
            applicationId: row.loan?.[0]?.application_id ?? '',
            installmentNo: row.installment_no,
            dueDate: row.due_date,
            dueTotal: Number(row.due_total),
            paidAmount: Number(row.paid_amount),
            outstandingAmount,
            daysOverdue
          }
        })
        .filter((row) => row.outstandingAmount > 0)
    }
  }
}
