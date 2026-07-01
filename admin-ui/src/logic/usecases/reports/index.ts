import { createReportsRepository } from '../../../lib/data/repositories/reports.repo'

export function createReportsUseCases(accessToken: string) {
  const repository = createReportsRepository(accessToken)

  return {
    getPortfolioSummary: () => repository.getPortfolioSummary(),
    getArrears: () => repository.getArrears(),
    getPipelineSummary: (startDate?: string, endDate?: string) => repository.getPipelineSummary(startDate, endDate),
    getOriginationTrends: (startDate?: string, endDate?: string) => repository.getOriginationTrends(startDate, endDate),
    getTurnaround: () => repository.getTurnaround(),
    getPipelineConversion: () => repository.getPipelineConversion(),
    getProductivity: () => repository.getProductivity(),
    getAuditLog: (from?: string, to?: string, limit?: number) => repository.getAuditLog(from, to, limit),
    getDemographicBreakdown: () => repository.getDemographicBreakdown(),
    getDebtorsAgeAnalysis: () => repository.getDebtorsAgeAnalysis(),
    getProvinceBreakdown: () => repository.getProvinceBreakdown()
  }
}
