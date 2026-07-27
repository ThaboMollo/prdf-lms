import {
  changeStatus,
  createApplication,
  deleteApplication as deleteApplicationRequest,
  getApplication,
  getHistory,
  getMyDraft,
  listApplications,
  recordConsent as recordConsentRequest,
  submitApplication,
  updateApplication,
  type ApplicationConsentInput,
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
    saveDraft: (id, input) =>
      id ? updateApplication(accessToken, id, input as UpdateApplicationInput) : createApplication(accessToken, input),
    getMyDraft: () => getMyDraft(accessToken),
    recordConsent: (applicationId: string, consent: ApplicationConsentInput) =>
      recordConsentRequest(accessToken, applicationId, consent),
    deleteApplication: (id: string) => deleteApplicationRequest(accessToken, id),
    assignApplication: (id: string, input: UpdateApplicationInput) => updateApplication(accessToken, id, input),
    submit: (id: string, note?: string) => submitApplication(accessToken, id, note),
    changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) =>
      changeStatus(accessToken, applicationId, toStatus, note),
    getHistory: (applicationId: string) => getHistory(accessToken, applicationId)
  }
}
