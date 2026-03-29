import type { CreateApplicationFormData } from '../../../features/applications/validation'
import type { LoanApplicationStatus, UpdateApplicationInput } from '../../../lib/api'
import { createApplicationsRepository } from '../../../lib/data/repositories/applications.repo'

export function createApplicationsUseCases(accessToken: string) {
  const repository = createApplicationsRepository(accessToken)

  return {
    listApplications: () => repository.listApplications(),
    getApplication: (id: string) => repository.getApplication(id),
    getHistory: (applicationId: string) => repository.getHistory(applicationId),
    createDraft: (payload: CreateApplicationFormData) =>
      repository.createDraft({
        requestedAmount: payload.requestedAmount,
        termMonths: payload.termMonths,
        purpose: payload.purpose,
        businessName: payload.businessName,
        registrationNo: payload.registrationNo,
        address: payload.address
      }),
    updateDraft: (id: string, input: UpdateApplicationInput) => repository.updateDraft(id, input),
    assignApplication: (id: string, input: UpdateApplicationInput) => repository.assignApplication(id, input),
    submitApplication: (id: string, note?: string) => repository.submit(id, note),
    transitionStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) =>
      repository.changeStatus(applicationId, toStatus, note)
  }
}
