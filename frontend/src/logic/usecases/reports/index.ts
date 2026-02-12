import { createReportsRepository } from '../../../lib/data/repositories/reports.repo'

export function createReportsUseCases(accessToken: string) {
  const repository = createReportsRepository(accessToken)

  return {
    getPortfolioSummary: () => repository.getPortfolioSummary(),
    getArrears: () => repository.getArrears()
  }
}
