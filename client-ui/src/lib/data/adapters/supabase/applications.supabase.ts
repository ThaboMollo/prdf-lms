import type {
  ApplicationConsentInput,
  ApplicationDetails,
  ApplicationSummary,
  CreateApplicationInput,
  LoanApplicationStatus,
  StatusHistoryItem,
  UpdateApplicationInput
} from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { ApplicationsRepository } from '../../repositories/applications.repo'

// Columns for a list/summary read.
const SUMMARY_COLS =
  'id, client_id, requested_amount, term_months, purpose, status, created_at, submitted_at, assigned_to_user_id'
// Adds the draft-resume fields for a detailed read.
const DETAIL_COLS = `${SUMMARY_COLS}, current_step, draft_state`

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
  current_step?: number | null
  draft_state?: Record<string, unknown> | null
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

function mapApplicationDetail(row: ApplicationRow): ApplicationDetails {
  return {
    ...mapApplicationRow(row),
    currentStep: row.current_step ?? null,
    draftState: row.draft_state ?? null
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

  // Only patch fields the caller actually provided, so an early draft save (before
  // the business profile is filled) doesn't clobber existing client data — and
  // never write empty strings, which fail column CHECK constraints (e.g. province).
  const fields: Record<string, unknown> = {}
  const setIf = (key: string, value: unknown) => {
    if (value !== undefined && value !== '') fields[key] = value
  }
  setIf('registration_no', input.registrationNo)
  setIf('address', input.address)
  setIf('province', input.province)
  setIf('spatial_type', input.spatialType)
  setIf('industry', input.industry)
  setIf('gender', input.gender)
  setIf('is_disabled', input.isDisabled)
  setIf('is_hdp', input.isHdp)
  setIf('is_rural', input.isRural)
  setIf('is_black_women_owned', input.isBlackWomenOwned)
  setIf('sa_citizenship_percentage', input.saCitizenshipPercentage)
  setIf('is_director_operational', input.isDirectorOperational)
  setIf('cipc_registered', input.cipcRegistered)
  setIf('sars_tax_pin', input.sarsTaxPin)
  setIf('insolvent_or_debt_review', input.insolventOrDebtReview)
  if (input.businessName?.trim()) fields.business_name = input.businessName.trim()

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
    // Persist any business-profile edits onto the existing client row.
    if (Object.keys(fields).length) {
      const updated = await client.from('clients').update(fields).eq('id', existing.data.id)
      if (updated.error) {
        throw new Error(`Supabase update client failed: ${updated.error.message}`)
      }
    }
    return existing.data.id as string
  }

  const created = await client
    .from('clients')
    .insert({
      user_id: userId,
      business_name: input.businessName?.trim() || 'Client Business',
      is_disabled: input.isDisabled ?? false,
      is_hdp: input.isHdp ?? false,
      is_rural: input.isRural ?? false,
      is_black_women_owned: input.isBlackWomenOwned ?? false,
      is_director_operational: input.isDirectorOperational ?? false,
      cipc_registered: input.cipcRegistered ?? false,
      insolvent_or_debt_review: input.insolventOrDebtReview ?? false,
      ...fields
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
      .select(DETAIL_COLS)
      .eq('id', id)
      .single()

    if (error) {
      throw new Error(`Supabase get application failed: ${error.message}`)
    }

    return mapApplicationDetail(data as ApplicationRow)
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
        submitted_at: submittedAt,
        // Leaving Draft: normalized columns are authoritative, so drop the
        // exact-UI-state blob (and its duplicated PII) once submitted.
        ...(toStatus === 'Draft' ? {} : { draft_state: null })
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

  const recordConsentInternal = async (
    applicationId: string,
    consent: ApplicationConsentInput
  ): Promise<void> => {
    const consentInsert = await client.from('application_consents').insert({
      application_id: applicationId,
      consent_version: consent.version,
      items: consent.items,
      acknowledged_by: actorUserId || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    })
    if (consentInsert.error) {
      throw new Error(`Supabase consent insert failed: ${consentInsert.error.message}`)
    }
  }

  const createDraftInternal = async (input: CreateApplicationInput): Promise<ApplicationDetails> => {
    const clientId = await resolveClientId(client, accessToken, input)

    const { data, error } = await client
      .from('loan_applications')
      .insert({
        client_id: clientId,
        requested_amount: input.requestedAmount ?? 0,
        term_months: input.termMonths ?? 0,
        purpose: input.purpose ?? '',
        status: 'Draft',
        assigned_to_user_id: input.assignedToUserId ?? null,
        monthly_revenue: input.monthlyRevenue ?? null,
        years_in_operation: input.yearsInOperation ?? null,
        number_of_employees: input.numberOfEmployees ?? null,
        bank_name: input.bankName ?? null,
        current_step: input.currentStep ?? 1,
        draft_state: input.draftState ?? null,
        last_saved_at: new Date().toISOString()
      })
      .select(DETAIL_COLS)
      .single()

    if (error) {
      throw new Error(`Supabase create draft failed: ${error.message}`)
    }

    const created = mapApplicationDetail(data as ApplicationRow)
    if (input.consent) {
      await recordConsentInternal(created.id, input.consent)
    }
    return created
  }

  // Full draft update: business profile (client row) + financials + loan details +
  // wizard position + exact UI state. Only patches fields the caller provided.
  const updateDraftFull = async (id: string, input: CreateApplicationInput): Promise<ApplicationDetails> => {
    await resolveClientId(client, accessToken, input)

    const patch: Record<string, unknown> = { last_saved_at: new Date().toISOString() }
    const setIf = (key: string, value: unknown) => {
      if (value !== undefined) patch[key] = value
    }
    setIf('requested_amount', input.requestedAmount)
    setIf('term_months', input.termMonths)
    setIf('purpose', input.purpose)
    setIf('monthly_revenue', input.monthlyRevenue)
    setIf('years_in_operation', input.yearsInOperation)
    setIf('number_of_employees', input.numberOfEmployees)
    setIf('bank_name', input.bankName)
    setIf('current_step', input.currentStep)
    setIf('draft_state', input.draftState)

    const { data, error } = await client
      .from('loan_applications')
      .update(patch)
      .eq('id', id)
      .eq('status', 'Draft')
      .select(DETAIL_COLS)
      .single()

    if (error) {
      throw new Error(`Supabase save draft failed: ${error.message}`)
    }
    return mapApplicationDetail(data as ApplicationRow)
  }

  const getMyDraftInternal = async (): Promise<ApplicationSummary | null> => {
    const userId = getUserIdFromAccessToken(accessToken)
    if (!userId) return null

    const clientRow = await client.from('clients').select('id').eq('user_id', userId).maybeSingle()
    if (clientRow.error) {
      throw new Error(`Supabase client lookup failed: ${clientRow.error.message}`)
    }
    if (!clientRow.data?.id) return null

    const draft = await client
      .from('loan_applications')
      .select(SUMMARY_COLS)
      .eq('client_id', clientRow.data.id)
      .eq('status', 'Draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (draft.error) {
      throw new Error(`Supabase get draft failed: ${draft.error.message}`)
    }
    return draft.data ? mapApplicationRow(draft.data as ApplicationRow) : null
  }

  // Create-or-update the client's single active draft (§ one active draft/client).
  const saveDraftInternal = async (
    id: string | null,
    input: CreateApplicationInput
  ): Promise<ApplicationDetails> => {
    const targetId = id ?? (await getMyDraftInternal())?.id ?? null
    return targetId ? updateDraftFull(targetId, input) : createDraftInternal(input)
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

    createDraft: (input: CreateApplicationInput) => createDraftInternal(input),
    updateDraft: (id: string, input: UpdateApplicationInput) => updateDraftInternal(id, input),
    assignApplication: (id: string, input: UpdateApplicationInput) => updateDraftInternal(id, input),
    saveDraft: (id: string | null, input: CreateApplicationInput) => saveDraftInternal(id, input),
    getMyDraft: () => getMyDraftInternal(),
    recordConsent: (applicationId: string, consent: ApplicationConsentInput) =>
      recordConsentInternal(applicationId, consent),
    async deleteApplication(id: string): Promise<void> {
      const { error } = await client.from('loan_applications').delete().eq('id', id)
      if (error) {
        throw new Error(`Supabase delete application failed: ${error.message}`)
      }
    },
    submit: (id: string, note?: string) => changeStatusInternal(id, 'Submitted', note),
    changeStatus: (applicationId: string, toStatus: LoanApplicationStatus, note?: string) =>
      changeStatusInternal(applicationId, toStatus, note)
  }
}
