import type {
  ApplicationDetails,
  ApplicationSummary,
  CreateApplicationInput,
  LoanApplicationStatus,
  StatusHistoryItem,
  UpdateApplicationInput
} from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { ApplicationsRepository } from '../../repositories/applications.repo'

type ApplicationRow = {
  id: string
  client_id: string
  requested_amount: number
  term_months: number
  purpose: string
  status: LoanApplicationStatus
  created_at: string
  submitted_at: string | null
  assigned_to_user_id: string | null
}

type HistoryRow = {
  id: string
  application_id: string
  from_status: LoanApplicationStatus | null
  to_status: LoanApplicationStatus
  changed_by: string
  changed_at: string
  note: string | null
}

function mapApplicationRow(row: ApplicationRow): ApplicationSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    requestedAmount: row.requested_amount,
    termMonths: row.term_months,
    purpose: row.purpose,
    status: row.status,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    assignedToUserId: row.assigned_to_user_id
  }
}

function mapHistoryRow(row: HistoryRow): StatusHistoryItem {
  return {
    id: row.id,
    applicationId: row.application_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    note: row.note
  }
}

function getUserIdFromAccessToken(accessToken: string): string {
  try {
    const [, payload] = accessToken.split('.')
    if (!payload) return ''
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
    return json.sub ?? ''
  } catch {
    return ''
  }
}

async function resolveClientId(
  client: ReturnType<typeof createSupabaseDataClient>,
  accessToken: string,
  input: CreateApplicationInput
): Promise<string> {
  if (input.clientId) return input.clientId

  const userId = getUserIdFromAccessToken(accessToken)
  if (!userId) {
    throw new Error('Unable to resolve authenticated user id for application draft.')
  }

  const existing = await client
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (existing.error) {
    throw new Error(`Supabase client lookup failed: ${existing.error.message}`)
  }

  if (existing.data?.id) {
    return existing.data.id as string
  }

  const created = await client
    .from('clients')
    .insert({
      user_id: userId,
      business_name: input.businessName?.trim() || 'Client Business',
      registration_no: input.registrationNo ?? null,
      address: input.address ?? null
    })
    .select('id')
    .single()

  if (created.error || !created.data?.id) {
    throw new Error(`Supabase create client failed: ${created.error?.message ?? 'unknown error'}`)
  }

  return created.data.id as string
}

export function createSupabaseApplicationsAdapter(accessToken: string): ApplicationsRepository {
  const client = createSupabaseDataClient(accessToken)
  const actorUserId = getUserIdFromAccessToken(accessToken)

  const getById = async (id: string): Promise<ApplicationDetails> => {
    const { data, error } = await client
      .from('loan_applications')
      .select('id, client_id, requested_amount, term_months, purpose, status, created_at, submitted_at, assigned_to_user_id')
      .eq('id', id)
      .single()

    if (error) {
      throw new Error(`Supabase get application failed: ${error.message}`)
    }

    return mapApplicationRow(data as ApplicationRow)
  }

  const updateDraftInternal = async (id: string, input: UpdateApplicationInput): Promise<ApplicationDetails> => {
    const { data, error } = await client
      .from('loan_applications')
      .update({
        requested_amount: input.requestedAmount,
        term_months: input.termMonths,
        purpose: input.purpose,
        assigned_to_user_id: input.assignedToUserId ?? null
      })
      .eq('id', id)
      .select('id, client_id, requested_amount, term_months, purpose, status, created_at, submitted_at, assigned_to_user_id')
      .single()

    if (error) {
      throw new Error(`Supabase update draft failed: ${error.message}`)
    }

    return mapApplicationRow(data as ApplicationRow)
  }

  const changeStatusInternal = async (
    applicationId: string,
    toStatus: LoanApplicationStatus,
    note?: string
  ): Promise<ApplicationDetails> => {
    const current = await getById(applicationId)
    const submittedAt =
      toStatus === 'Submitted' && !current.submittedAt ? new Date().toISOString() : current.submittedAt

    const update = await client
      .from('loan_applications')
      .update({
        status: toStatus,
        submitted_at: submittedAt
      })
      .eq('id', applicationId)
      .select('id, client_id, requested_amount, term_months, purpose, status, created_at, submitted_at, assigned_to_user_id')
      .single()

    if (update.error) {
      throw new Error(`Supabase change status failed: ${update.error.message}`)
    }

    if (actorUserId) {
      await client.from('application_status_history').insert({
        application_id: applicationId,
        from_status: current.status,
        to_status: toStatus,
        changed_by: actorUserId,
        note: note ?? null
      })
    }

    return mapApplicationRow(update.data as ApplicationRow)
  }

  return {
    async listApplications(): Promise<ApplicationSummary[]> {
      const { data, error } = await client
        .from('loan_applications')
        .select('id, client_id, requested_amount, term_months, purpose, status, created_at, submitted_at, assigned_to_user_id')
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Supabase list applications failed: ${error.message}`)
      }

      return (data as ApplicationRow[]).map(mapApplicationRow)
    },

    getApplication: (id: string) => getById(id),

    async getHistory(applicationId: string): Promise<StatusHistoryItem[]> {
      const { data, error } = await client
        .from('application_status_history')
        .select('id, application_id, from_status, to_status, changed_by, changed_at, note')
        .eq('application_id', applicationId)
        .order('changed_at', { ascending: false })

      if (error) {
        throw new Error(`Supabase get application history failed: ${error.message}`)
      }

      return (data as HistoryRow[]).map(mapHistoryRow)
    },

    async createDraft(input: CreateApplicationInput): Promise<ApplicationDetails> {
      const clientId = await resolveClientId(client, accessToken, input)

      const { data, error } = await client
        .from('loan_applications')
        .insert({
          client_id: clientId,
          requested_amount: input.requestedAmount,
          term_months: input.termMonths,
          purpose: input.purpose,
          status: 'Draft',
          assigned_to_user_id: input.assignedToUserId ?? null
        })
        .select('id, client_id, requested_amount, term_months, purpose, status, created_at, submitted_at, assigned_to_user_id')
        .single()

      if (error) {
        throw new Error(`Supabase create draft failed: ${error.message}`)
      }

      return mapApplicationRow(data as ApplicationRow)
    },

    updateDraft: (id: string, input: UpdateApplicationInput) => updateDraftInternal(id, input),
    assignApplication: (id: string, input: UpdateApplicationInput) => updateDraftInternal(id, input),
    submit: (id: string, note?: string) => changeStatusInternal(id, 'Submitted', note),
    changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) =>
      changeStatusInternal(applicationId, toStatus, note)
  }
}
