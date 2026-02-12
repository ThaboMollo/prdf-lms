import {
  changeStatus,
  createApplication,
  getApplication,
  getHistory,
  listApplications,
  submitApplication,
  updateApplication,
  type CreateApplicationInput,
  type LoanApplicationStatus,
  type UpdateApplicationInput
} from '../../../api'
import type { ApplicationsRepository } from '../../repositories/applications.repo'

export function createApiApplicationsAdapter(accessToken: string): ApplicationsRepository {
  return {
    listApplications: () => listApplications(accessToken),
    getApplication: (id) => getApplication(accessToken, id),
    createDraft: (input: CreateApplicationInput) => createApplication(accessToken, input),
    updateDraft: (id: string, input: UpdateApplicationInput) => updateApplication(accessToken, id, input),
    assignApplication: (id: string, input: UpdateApplicationInput) => updateApplication(accessToken, id, input),
    submit: (id: string, note?: string) => submitApplication(accessToken, id, note),
    changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) =>
      changeStatus(accessToken, applicationId, toStatus, note),
    getHistory: (applicationId: string) => getHistory(accessToken, applicationId)
  }
}
