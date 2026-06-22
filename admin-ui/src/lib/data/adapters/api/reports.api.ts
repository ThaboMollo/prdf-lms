import type {
  ArrearsItem,
  AuditLogItem,
  OriginationTrendItem,
  PipelineConversionItem,
  PipelineSummaryItem,
  PortfolioSummary,
  ProductivityItem,
  TurnaroundResult
} from '../../../api'
import * as api from '../../../api'
import type { ReportsRepository } from '../../repositories/reports.repo'

export function createApiReportsAdapter(accessToken: string): ReportsRepository {
  return {
    getPortfolioSummary: (): Promise<PortfolioSummary> => api.getPortfolioSummary(accessToken),
    getArrears: (): Promise<ArrearsItem[]> => api.getArrears(accessToken),
    getPipelineSummary: (startDate?: string, endDate?: string): Promise<PipelineSummaryItem[]> =>
      api.getPipelineSummary(accessToken, startDate, endDate),
    getOriginationTrends: (startDate?: string, endDate?: string): Promise<OriginationTrendItem[]> =>
      api.getOriginationTrends(accessToken, startDate, endDate),
    getTurnaround: (): Promise<TurnaroundResult> => api.getTurnaround(accessToken),
    getPipelineConversion: (): Promise<PipelineConversionItem[]> => api.getPipelineConversion(accessToken),
    getProductivity: (): Promise<ProductivityItem[]> => api.getProductivity(accessToken),
    getAuditLog: (from?: string, to?: string, limit?: number): Promise<AuditLogItem[]> =>
      api.getAuditLog(accessToken, from, to, limit)
  }
}
