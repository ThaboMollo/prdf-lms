import type { ArrearsItem, PortfolioSummary } from '../../api'
import { createApiReportsAdapter } from '../adapters/api/reports.api'

export type ReportsRepository = {
  getPortfolioSummary: () => Promise<PortfolioSummary>
  getArrears: () => Promise<ArrearsItem[]>
}

export function createReportsRepository(accessToken: string): ReportsRepository {
  return createApiReportsAdapter(accessToken)
}
