import type { ArrearsItem, PortfolioSummary } from '../../api'
import { createSupabaseReportsAdapter } from '../adapters/supabase/reports.supabase'

export type ReportsRepository = {
  getPortfolioSummary: () => Promise<PortfolioSummary>
  getArrears: () => Promise<ArrearsItem[]>
}

export function createReportsRepository(accessToken: string): ReportsRepository {
  return createSupabaseReportsAdapter(accessToken)
}
