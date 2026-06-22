import type { ArrearsItem, AuditLogItem, OriginationTrendItem, PipelineConversionItem, PipelineSummaryItem, PortfolioSummary, ProductivityItem, TurnaroundResult } from '../../../api'
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
    },
    async getPipelineSummary(): Promise<PipelineSummaryItem[]> {
      const { data, error } = await client.from('loan_applications').select('status, requested_amount')
      if (error) throw new Error(`Supabase pipeline query failed: ${error.message}`)

      const summary = (data ?? []).reduce((acc: Record<string, { count: number; totalAmount: number }>, row) => {
        const st = row.status
        if (!acc[st]) acc[st] = { count: 0, totalAmount: 0 }
        acc[st].count += 1
        acc[st].totalAmount += Number(row.requested_amount)
        return acc
      }, {})

      return Object.entries(summary).map(([status, metrics]) => ({
        status: status as any,
        count: metrics.count,
        totalAmount: metrics.totalAmount
      }))
    },
    async getOriginationTrends(): Promise<OriginationTrendItem[]> {
      const { data, error } = await client
        .from('loans')
        .select('principal_amount, disbursed_at')
        .not('disbursed_at', 'is', null)

      if (error) throw new Error(`Supabase origination query failed: ${error.message}`)

      const trends = (data ?? []).reduce((acc: Record<string, { count: number; totalAmount: number }>, row) => {
        if (!row.disbursed_at) return acc
        const month = row.disbursed_at.substring(0, 7) // 'YYYY-MM'
        if (!acc[month]) acc[month] = { count: 0, totalAmount: 0 }
        acc[month].count += 1
        acc[month].totalAmount += Number(row.principal_amount)
        return acc
      }, {})

      return Object.entries(trends)
        .map(([month, metrics]) => ({ month, count: metrics.count, totalAmount: metrics.totalAmount }))
        .sort((a, b) => a.month.localeCompare(b.month))
    },
    async getTurnaround(): Promise<TurnaroundResult> {
      throw new Error('getTurnaround is only available on the API provider.')
    },
    async getPipelineConversion(): Promise<PipelineConversionItem[]> {
      throw new Error('getPipelineConversion is only available on the API provider.')
    },
    async getProductivity(): Promise<ProductivityItem[]> {
      throw new Error('getProductivity is only available on the API provider.')
    },
    async getAuditLog(): Promise<AuditLogItem[]> {
      throw new Error('getAuditLog is only available on the API provider.')
    }
  }
}
