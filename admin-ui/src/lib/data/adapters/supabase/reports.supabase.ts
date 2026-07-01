import type { ArrearsItem, AuditLogItem, DebtorsAgeBucket, DemographicBreakdown, ProvinceBreakdown, OriginationTrendItem, PipelineConversionItem, PipelineSummaryItem, PortfolioSummary, ProductivityItem, TurnaroundResult } from '../../../api'
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

type DemographicRow = {
  gender: string | null
  is_hdp: boolean | null
  is_disabled: boolean | null
  is_rural: boolean | null
  is_black_women_owned: boolean | null
}

type ScheduleAgeRow = {
  due_date: string
  due_total: number
  paid_amount: number
}

type ProvinceRow = {
  province: string | null
  spatial_type: string | null
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
    async getDemographicBreakdown(): Promise<DemographicBreakdown> {
      const { data, error } = await client
        .from('clients')
        .select('gender, is_hdp, is_disabled, is_rural, is_black_women_owned')

      if (error) {
        throw new Error(`Supabase demographic breakdown failed: ${error.message}`)
      }

      const rows = (data ?? []) as DemographicRow[]
      const genderCounts = new Map<string, number>()
      let hdp = 0
      let disabled = 0
      let rural = 0
      let blackWomenOwned = 0

      for (const row of rows) {
        const gender = (row.gender ?? '').trim() || 'Unspecified'
        genderCounts.set(gender, (genderCounts.get(gender) ?? 0) + 1)
        if (row.is_hdp) hdp += 1
        if (row.is_disabled) disabled += 1
        if (row.is_rural) rural += 1
        if (row.is_black_women_owned) blackWomenOwned += 1
      }

      return {
        totalClients: rows.length,
        byGender: [...genderCounts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
        flags: [
          { label: 'Black Women-Owned', count: blackWomenOwned },
          { label: 'Historically Disadvantaged (HDP)', count: hdp },
          { label: 'Person with Disability', count: disabled },
          { label: 'Rural', count: rural }
        ]
      }
    },
    async getDebtorsAgeAnalysis(): Promise<DebtorsAgeBucket[]> {
      const { data, error } = await client
        .from('repayment_schedule')
        .select('due_date, due_total, paid_amount')

      if (error) {
        throw new Error(`Supabase debtors age analysis failed: ${error.message}`)
      }

      const now = Date.now()
      const buckets: { bucket: string; min: number; max: number; installments: number; outstandingAmount: number }[] = [
        { bucket: 'Current (not overdue)', min: -Infinity, max: 0, installments: 0, outstandingAmount: 0 },
        { bucket: '1-30 days', min: 1, max: 30, installments: 0, outstandingAmount: 0 },
        { bucket: '31-60 days', min: 31, max: 60, installments: 0, outstandingAmount: 0 },
        { bucket: '61-90 days', min: 61, max: 90, installments: 0, outstandingAmount: 0 },
        { bucket: '91-120 days', min: 91, max: 120, installments: 0, outstandingAmount: 0 },
        { bucket: '120+ days', min: 121, max: Infinity, installments: 0, outstandingAmount: 0 }
      ]

      for (const row of (data ?? []) as ScheduleAgeRow[]) {
        const outstanding = Number(row.due_total) - Number(row.paid_amount)
        if (outstanding <= 0) continue
        const daysOverdue = Math.floor((now - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24))
        const bucket = buckets.find((b) => daysOverdue >= b.min && daysOverdue <= b.max)
        if (bucket) {
          bucket.installments += 1
          bucket.outstandingAmount += outstanding
        }
      }

      return buckets.map(({ bucket, installments, outstandingAmount }) => ({ bucket, installments, outstandingAmount }))
    },
    async getProvinceBreakdown(): Promise<ProvinceBreakdown> {
      const { data, error } = await client.from('clients').select('province, spatial_type')

      if (error) {
        throw new Error(`Supabase province breakdown failed: ${error.message}`)
      }

      const rows = (data ?? []) as ProvinceRow[]
      const provinceCounts = new Map<string, number>()
      const spatialCounts = new Map<string, number>()

      for (const row of rows) {
        const province = (row.province ?? '').trim() || 'Unspecified'
        provinceCounts.set(province, (provinceCounts.get(province) ?? 0) + 1)
        const spatial = (row.spatial_type ?? '').trim() || 'Unspecified'
        spatialCounts.set(spatial, (spatialCounts.get(spatial) ?? 0) + 1)
      }

      const toSortedCounts = (counts: Map<string, number>) =>
        [...counts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)

      return {
        totalClients: rows.length,
        byProvince: toSortedCounts(provinceCounts),
        bySpatialType: toSortedCounts(spatialCounts)
      }
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
