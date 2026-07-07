import type {
  ApplicationConsentInput,
  ApplicationDetails,
  ApplicationSummary,
  CreateApplicationInput,
  LoanApplicationStatus,
  StatusHistoryItem,
  UpdateApplicationInput
} from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createSupabaseApplicationsAdapter } from '../adapters/supabase/applications.supabase'

export type ApplicationsRepository = {
  listApplications: () => Promise<ApplicationSummary[]>
  getApplication: (id: string) => Promise<ApplicationDetails>
  createDraft: (input: CreateApplicationInput) => Promise<ApplicationDetails>
  updateDraft: (id: string, input: UpdateApplicationInput) => Promise<ApplicationDetails>
  // Save (create-or-update) the client's single active draft from the wizard.
  saveDraft: (id: string | null, input: CreateApplicationInput) => Promise<ApplicationDetails>
  // The signed-in client's current open draft, if any.
  getMyDraft: () => Promise<ApplicationSummary | null>
  // Persist POPIA consent for an application (used at submit time).
  recordConsent: (applicationId: string, consent: ApplicationConsentInput) => Promise<void>
  // Delete an application. Client-allowed only on their own draft.
  deleteApplication: (id: string) => Promise<void>
  assignApplication: (id: string, input: UpdateApplicationInput) => Promise<ApplicationDetails>
  submit: (id: string, note?: string) => Promise<ApplicationDetails>
  changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) => Promise<ApplicationDetails>
  getHistory: (applicationId: string) => Promise<StatusHistoryItem[]>
}

export function createApplicationsRepository(accessToken: string): ApplicationsRepository {
  const provider = getDataProvider()
  if (provider === 'api') {
    console.warn('Applications repository forced to Supabase adapter for client UI runtime.')
  }

  return createSupabaseApplicationsAdapter(accessToken)
}
