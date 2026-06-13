import type { ArrearsItem, PortfolioSummary, PipelineSummaryItem, OriginationTrendItem } from '../../api'
import { createSupabaseReportsAdapter } from '../adapters/supabase/reports.supabase'

export type ReportsRepository = {
  getPortfolioSummary: () => Promise<PortfolioSummary>
  getArrears: () => Promise<ArrearsItem[]>
  getPipelineSummary: () => Promise<PipelineSummaryItem[]>
  getOriginationTrends: () => Promise<OriginationTrendItem[]>
}

export function createReportsRepository(accessToken: string): ReportsRepository {
  return createSupabaseReportsAdapter(accessToken)
}
