import { getArrears, getPortfolioSummary } from '../../../api'
import type { ReportsRepository } from '../../repositories/reports.repo'

export function createApiReportsAdapter(accessToken: string): ReportsRepository {
  return {
    getPortfolioSummary: () => getPortfolioSummary(accessToken),
    getArrears: () => getArrears(accessToken)
  }
}
