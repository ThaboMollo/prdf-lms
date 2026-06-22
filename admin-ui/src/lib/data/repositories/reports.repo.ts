import type {
  ArrearsItem,
  AuditLogItem,
  OriginationTrendItem,
  PipelineConversionItem,
  PipelineSummaryItem,
  PortfolioSummary,
  ProductivityItem,
  TurnaroundResult
} from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createSupabaseReportsAdapter } from '../adapters/supabase/reports.supabase'
import { createApiReportsAdapter } from '../adapters/api/reports.api'

export type ReportsRepository = {
  getPortfolioSummary: () => Promise<PortfolioSummary>
  getArrears: () => Promise<ArrearsItem[]>
  getPipelineSummary: (startDate?: string, endDate?: string) => Promise<PipelineSummaryItem[]>
  getOriginationTrends: (startDate?: string, endDate?: string) => Promise<OriginationTrendItem[]>
  getTurnaround: () => Promise<TurnaroundResult>
  getPipelineConversion: () => Promise<PipelineConversionItem[]>
  getProductivity: () => Promise<ProductivityItem[]>
  getAuditLog: (from?: string, to?: string, limit?: number) => Promise<AuditLogItem[]>
}

export function createReportsRepository(accessToken: string): ReportsRepository {
  if (getDataProvider() === 'api') {
    return createApiReportsAdapter(accessToken)
  }
  return createSupabaseReportsAdapter(accessToken)
}
