import type {
  ApplicationDetails,
  ApplicationSummary,
  CreateApplicationInput,
  LoanApplicationStatus,
  StatusHistoryItem,
  UpdateApplicationInput
} from '../../api'
import { createApiApplicationsAdapter } from '../adapters/api/applications.api'

export type ApplicationsRepository = {
  listApplications: () => Promise<ApplicationSummary[]>
  getApplication: (id: string) => Promise<ApplicationDetails>
  createDraft: (input: CreateApplicationInput) => Promise<ApplicationDetails>
  updateDraft: (id: string, input: UpdateApplicationInput) => Promise<ApplicationDetails>
  assignApplication: (id: string, input: UpdateApplicationInput) => Promise<ApplicationDetails>
  submit: (id: string, note?: string) => Promise<ApplicationDetails>
  changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) => Promise<ApplicationDetails>
  getHistory: (applicationId: string) => Promise<StatusHistoryItem[]>
}

export function createApplicationsRepository(accessToken: string): ApplicationsRepository {
  return createApiApplicationsAdapter(accessToken)
}
