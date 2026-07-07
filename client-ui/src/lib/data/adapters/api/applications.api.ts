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
    // Draft save/resume is a Supabase-provider feature; the REST provider isn't
    // used by the client UI runtime. Provide minimal stubs to satisfy the type.
    saveDraft: (id, input) =>
      id ? updateApplication(accessToken, id, input as UpdateApplicationInput) : createApplication(accessToken, input),
    getMyDraft: async () => null,
    recordConsent: async () => {
      throw new Error('recordConsent is not supported by the REST provider.')
    },
    deleteApplication: async () => {
      throw new Error('deleteApplication is not supported by the REST provider.')
    },
    assignApplication: (id: string, input: UpdateApplicationInput) => updateApplication(accessToken, id, input),
    submit: (id: string, note?: string) => submitApplication(accessToken, id, note),
    changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) =>
      changeStatus(accessToken, applicationId, toStatus, note),
    getHistory: (applicationId: string) => getHistory(accessToken, applicationId)
  }
}
