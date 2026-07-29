import { env } from './config/env'
import { parseApiResponse, ApiError } from '../../../packages/domain/api-error'
import type { LoanApplicationStatus } from '../../../packages/domain/status'

export type { LoanApplicationStatus }

// Re-exported so pages can narrow with `catch (e) { if (e instanceof ApiError) }`
// without reaching across into packages/domain themselves.
export { ApiError }
export type { FieldError } from '../../../packages/domain/api-error'

export type MeResponse = {
  userId: string
  email: string | null
  fullName: string | null
  roles: string[]
}

export type AdminAccessFilter = 'all' | 'internal' | 'clients' | 'admins' | 'non-admins'

export type AdminAccessListItem = {
  userId: string
  fullName: string | null
  email: string | null
  roles: string[]
  isAdmin: boolean
  isInternal: boolean
  canGrant: boolean
  canRevoke: boolean
  grantDisabledReason: string | null
  revokeDisabledReason: string | null
}

export type AdminAccessMutationResult = {
  userId: string
  roles: string[]
  isAdmin: boolean
}

export type AssignableRole = 'Client' | 'Intern' | 'Originator' | 'LoanOfficer' | 'Admin'

export type ApplicationSummary = {
  id: string
  clientId: string
  requestedAmount: number
  termMonths: number
  purpose: string
  status: LoanApplicationStatus
  createdAt: string
  submittedAt: string | null
  assignedToUserId: string | null
}

export type ClientDetails = {
  businessName: string | null
  registrationNo: string | null
  address: string | null
  fullName: string | null
  phone: string | null
  employmentStatus: string | null
}

export type ApplicationDetails = ApplicationSummary & {
  loanId?: string | null
  clientDetails?: ClientDetails
}

export type StatusHistoryItem = {
  id: string
  applicationId: string
  fromStatus: LoanApplicationStatus | null
  toStatus: LoanApplicationStatus
  changedBy: string
  changedAt: string
  note: string | null
}

export type TaskItem = {
  id: string
  applicationId: string
  title: string
  status: string
  assignedTo: string | null
  dueDate: string | null
}

export type NoteItem = {
  id: string
  applicationId: string
  body: string
  createdBy: string
  createdAt: string
}

export type ApplicationDocument = {
  id: string
  applicationId: string
  docType: string
  storagePath: string
  status: string
  uploadedBy: string
  uploadedAt: string
}

export type DocumentVerificationStatus = 'Verified' | 'Rejected'

export type CreateApplicationInput = {
  clientId?: string
  requestedAmount: number
  termMonths: number
  purpose: string
  businessName?: string
  registrationNo?: string
  address?: string
  assignedToUserId?: string
  consent?: ApplicationConsentInput
}

export type ApplicationConsentItem = {
  key: string
  section: string
  prompt: string
  answer: boolean
}

export type ApplicationConsentInput = {
  version: string
  items: ApplicationConsentItem[]
}

export type UpdateApplicationInput = {
  requestedAmount: number
  termMonths: number
  purpose: string
  assignedToUserId?: string
}

export type PresignUploadResponse = {
  bucket: string
  storagePath: string
  uploadUrl: string
  expiresInSeconds: number
}

export type LoanStatus = 'PendingDisbursement' | 'Disbursed' | 'InRepayment' | 'Closed'

export type LoanRepaymentItem = {
  id: string
  amount: number
  principalComponent: number
  interestComponent: number
  paidAt: string
  paymentReference: string | null
}

export type LoanScheduleItem = {
  id: string
  installmentNo: number
  dueDate: string
  duePrincipal: number
  dueInterest: number
  dueTotal: number
  paidAmount: number
  status: string
  paidAt: string | null
}

export type LoanDetails = {
  id: string
  applicationId: string
  principalAmount: number
  outstandingPrincipal: number
  interestRate: number
  termMonths: number
  status: LoanStatus
  disbursedAt: string | null
  createdAt: string
  schedule: LoanScheduleItem[]
  repayments: LoanRepaymentItem[]
}

export type PortfolioSummary = {
  totalLoans: number
  activeLoans: number
  totalPrincipal: number
  outstandingPrincipal: number
  repaidPrincipal: number
}

export type PipelineSummaryItem = {
  status: LoanApplicationStatus
  count: number
  totalAmount: number
}

export type OriginationTrendItem = {
  month: string
  count: number
  totalAmount: number
}

export type NotificationItem = {
  id: string
  userId: string
  channel: string
  type: string
  title: string
  message: string
  status: string
  createdAt: string
  sentAt: string | null
  readAt: string | null
  payloadJson: string | null
}

export type ArrearsItem = {
  loanId: string
  applicationId: string
  installmentNo: number
  dueDate: string
  dueTotal: number
  paidAmount: number
  outstandingAmount: number
  daysOverdue: number
}

export type TurnaroundResult = {
  count: number
  averageDays: number
}

export type DemographicCount = {
  label: string
  count: number
}

export type DemographicBreakdown = {
  totalClients: number
  byGender: DemographicCount[]
  flags: DemographicCount[]
}

export type ProvinceBreakdown = {
  totalClients: number
  byProvince: DemographicCount[]
  bySpatialType: DemographicCount[]
}

export type DebtorsAgeBucket = {
  bucket: string
  installments: number
  outstandingAmount: number
}

export type PipelineConversionItem = {
  fromStatus: LoanApplicationStatus | null
  toStatus: LoanApplicationStatus
  count: number
}

export type ProductivityItem = {
  userId: string
  tasksCompleted: number
  applicationsHandled: number
}

export type AuditLogItem = {
  id: string
  entity: string
  entityId: string
  action: string
  actorUserId: string
  at: string
  metadata: string | null
}

export type NonFinancialSupportItem = {
  id: string
  clientId: string
  applicationId: string | null
  advisorUserId: string
  supportType: string
  durationHours: number
  dateProvided: string
  notes: string | null
  createdAt: string
}

export type CreateNfsInput = {
  clientId: string
  applicationId?: string
  supportType: string
  durationHours: number
  dateProvided: string
  notes?: string
}

const apiBaseUrl = env.VITE_API_BASE_URL

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
}

// Shared with the other app — see packages/domain/api-error.ts. Preserves the
// server's field-level `errors` instead of stringifying the body, which is what
// lets a form show a message against the input that caused it.
const parseResponse = parseApiResponse

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const response = await fetch(`${apiBaseUrl}/me`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<MeResponse>(response)
}

export async function listAdminUserAccess(
  accessToken: string,
  input: { search?: string; filter?: AdminAccessFilter; role?: string } = {}
): Promise<AdminAccessListItem[]> {
  const params = new URLSearchParams()
  if (input.search?.trim()) params.set('search', input.search.trim())
  params.set('filter', input.filter ?? 'all')
  if (input.role?.trim()) params.set('role', input.role.trim())

  const response = await fetch(`${apiBaseUrl}/api/admin/users/access?${params.toString()}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<AdminAccessListItem[]>(response)
}

export async function assignUserRole(accessToken: string, userId: string, role: AssignableRole): Promise<AdminAccessMutationResult> {
  const response = await fetch(`${apiBaseUrl}/api/admin/users/${userId}/roles/${role}`, {
    method: 'POST',
    headers: authHeaders(accessToken)
  })
  return parseResponse<AdminAccessMutationResult>(response)
}

export async function removeUserRole(accessToken: string, userId: string, role: AssignableRole): Promise<AdminAccessMutationResult> {
  const response = await fetch(`${apiBaseUrl}/api/admin/users/${userId}/roles/${role}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken)
  })
  return parseResponse<AdminAccessMutationResult>(response)
}

/**
 * Clear a user's MFA factors so they can enrol again. SuperAdmin only.
 * This is the only recovery path from an MFA lockout — Supabase has no
 * self-service reset.
 */
export async function resetUserMfa(accessToken: string, userId: string): Promise<{ userId: string; factorsRemoved: number }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/users/${userId}/mfa`, {
    method: 'DELETE',
    headers: authHeaders(accessToken)
  })
  return parseResponse<{ userId: string; factorsRemoved: number }>(response)
}

export async function createApplication(accessToken: string, input: CreateApplicationInput): Promise<ApplicationDetails> {
  const response = await fetch(`${apiBaseUrl}/api/applications`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  })
  return parseResponse<ApplicationDetails>(response)
}

export async function updateApplication(accessToken: string, id: string, input: UpdateApplicationInput): Promise<ApplicationDetails> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  })
  return parseResponse<ApplicationDetails>(response)
}

export async function submitApplication(accessToken: string, id: string, note?: string): Promise<ApplicationDetails> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${id}/submit`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ note: note ?? null })
  })
  return parseResponse<ApplicationDetails>(response)
}

export async function listApplications(accessToken: string): Promise<ApplicationSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/applications`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ApplicationSummary[]>(response)
}

export async function getApplication(accessToken: string, id: string): Promise<ApplicationDetails> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${id}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ApplicationDetails>(response)
}

export async function presignUpload(
  accessToken: string,
  applicationId: string,
  docType: string,
  fileName: string,
  contentType?: string
): Promise<PresignUploadResponse> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/documents/presign-upload`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ docType, fileName, contentType: contentType ?? null })
  })
  return parseResponse<PresignUploadResponse>(response)
}

export async function uploadToSignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
  }
}

export async function confirmUpload(
  accessToken: string,
  applicationId: string,
  docType: string,
  storagePath: string,
  status = 'Pending'
): Promise<ApplicationDocument> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/documents/confirm`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ docType, storagePath, status })
  })

  return parseResponse<ApplicationDocument>(response)
}

export async function listDocuments(accessToken: string, applicationId: string): Promise<ApplicationDocument[]> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/documents`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ApplicationDocument[]>(response)
}

export async function verifyDocument(
  accessToken: string,
  applicationId: string,
  documentId: string,
  status: DocumentVerificationStatus,
  note?: string
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/documents/${documentId}/verify`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ status, note: note ?? null })
  })

  await parseResponse<void>(response)
}

export async function getDocumentUrl(accessToken: string, applicationId: string, documentId: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/documents/${documentId}/url`, {
    headers: authHeaders(accessToken)
  })
  const { url } = await parseResponse<{ url: string }>(response)
  return url
}

export async function changeStatus(
  accessToken: string,
  applicationId: string,
  toStatus: LoanApplicationStatus,
  note?: string
): Promise<ApplicationDetails> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/status`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ toStatus, note: note ?? null })
  })
  return parseResponse<ApplicationDetails>(response)
}

export async function getHistory(accessToken: string, applicationId: string): Promise<StatusHistoryItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/history`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<StatusHistoryItem[]>(response)
}

export async function listTasks(accessToken: string, options?: { applicationId?: string; assignedToMe?: boolean }): Promise<TaskItem[]> {
  const params = new URLSearchParams()
  if (options?.applicationId) params.set('applicationId', options.applicationId)
  if (options?.assignedToMe) params.set('assignedToMe', 'true')
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(`${apiBaseUrl}/api/tasks${suffix}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<TaskItem[]>(response)
}

export async function createTask(
  accessToken: string,
  input: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }
): Promise<TaskItem> {
  const response = await fetch(`${apiBaseUrl}/api/tasks`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      applicationId: input.applicationId,
      title: input.title,
      assignedTo: input.assignedTo ?? null,
      dueDate: input.dueDate ?? null
    })
  })
  return parseResponse<TaskItem>(response)
}

export async function updateTask(
  accessToken: string,
  taskId: string,
  input: { title?: string; assignedTo?: string; dueDate?: string }
): Promise<TaskItem> {
  const response = await fetch(`${apiBaseUrl}/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      title: input.title ?? null,
      assignedTo: input.assignedTo ?? null,
      dueDate: input.dueDate ?? null
    })
  })
  return parseResponse<TaskItem>(response)
}

export async function completeTask(accessToken: string, taskId: string, note?: string): Promise<TaskItem> {
  const response = await fetch(`${apiBaseUrl}/api/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ note: note ?? null })
  })
  return parseResponse<TaskItem>(response)
}

export async function listNotes(accessToken: string, applicationId: string): Promise<NoteItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/notes`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<NoteItem[]>(response)
}

export async function createNote(accessToken: string, applicationId: string, body: string): Promise<NoteItem> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/notes`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ body })
  })
  return parseResponse<NoteItem>(response)
}

export async function getLoan(accessToken: string, loanId: string): Promise<LoanDetails> {
  const response = await fetch(`${apiBaseUrl}/api/loans/${loanId}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<LoanDetails>(response)
}

export async function disburseLoan(accessToken: string, loanId: string, amount: number, reference?: string): Promise<LoanDetails> {
  const response = await fetch(`${apiBaseUrl}/api/loans/${loanId}/disburse`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ amount, reference: reference ?? null })
  })
  return parseResponse<LoanDetails>(response)
}

export async function recordRepayment(
  accessToken: string,
  loanId: string,
  amount: number,
  paymentReference?: string,
  paidAt?: string
): Promise<LoanDetails> {
  const response = await fetch(`${apiBaseUrl}/api/loans/${loanId}/repayments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      amount,
      paymentReference: paymentReference ?? null,
      paidAt: paidAt ?? null
    })
  })
  return parseResponse<LoanDetails>(response)
}

export async function getPortfolioSummary(accessToken: string): Promise<PortfolioSummary> {
  const response = await fetch(`${apiBaseUrl}/api/reports/portfolio`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<PortfolioSummary>(response)
}

export async function getArrears(accessToken: string): Promise<ArrearsItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/reports/arrears`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ArrearsItem[]>(response)
}

export async function listNotifications(accessToken: string, unreadOnly = false): Promise<NotificationItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/notifications?unreadOnly=${unreadOnly ? 'true' : 'false'}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<NotificationItem[]>(response)
}

export async function markNotificationRead(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeaders(accessToken)
  })
  await parseResponse<void>(response)
}

export async function getPipelineSummary(accessToken: string, startDate?: string, endDate?: string): Promise<PipelineSummaryItem[]> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(`${apiBaseUrl}/api/reports/pipeline-summary${suffix}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<PipelineSummaryItem[]>(response)
}

export async function getOriginationTrends(accessToken: string, startDate?: string, endDate?: string): Promise<OriginationTrendItem[]> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(`${apiBaseUrl}/api/reports/origination-trends${suffix}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<OriginationTrendItem[]>(response)
}

export async function getTurnaround(accessToken: string): Promise<TurnaroundResult> {
  const response = await fetch(`${apiBaseUrl}/api/reports/turnaround`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<TurnaroundResult>(response)
}

export async function getPipelineConversion(accessToken: string): Promise<PipelineConversionItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/reports/pipeline-conversion`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<PipelineConversionItem[]>(response)
}

export async function getProductivity(accessToken: string): Promise<ProductivityItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/reports/productivity`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ProductivityItem[]>(response)
}

export async function getAuditLog(accessToken: string, from?: string, to?: string, limit = 200): Promise<AuditLogItem[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  params.set('limit', String(limit))
  const response = await fetch(`${apiBaseUrl}/api/reports/audit?${params.toString()}`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<AuditLogItem[]>(response)
}

export async function getDemographicBreakdown(accessToken: string): Promise<DemographicBreakdown> {
  const response = await fetch(`${apiBaseUrl}/api/reports/demographic`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<DemographicBreakdown>(response)
}

export async function getDebtorsAgeAnalysis(accessToken: string): Promise<DebtorsAgeBucket[]> {
  const response = await fetch(`${apiBaseUrl}/api/reports/debtors-age`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<DebtorsAgeBucket[]>(response)
}

export async function getProvinceBreakdown(accessToken: string): Promise<ProvinceBreakdown> {
  const response = await fetch(`${apiBaseUrl}/api/reports/province`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ProvinceBreakdown>(response)
}

export type AssignableUser = {
  userId: string
  name: string
  roles: string[]
}

export async function listAssignableUsers(accessToken: string): Promise<AssignableUser[]> {
  const response = await fetch(`${apiBaseUrl}/api/users/assignable`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<AssignableUser[]>(response)
}

export async function getUserProfiles(accessToken: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const response = await fetch(`${apiBaseUrl}/api/users/profiles?ids=${ids.map(encodeURIComponent).join(',')}`, {
    headers: authHeaders(accessToken)
  })
  const rows = await parseResponse<{ userId: string; fullName: string | null }[]>(response)
  const names = new Map<string, string>()
  for (const row of rows) {
    if (row.fullName) names.set(row.userId, row.fullName)
  }
  return names
}

export async function listNfs(accessToken: string, clientId: string): Promise<NonFinancialSupportItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/clients/${clientId}/nfs`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<NonFinancialSupportItem[]>(response)
}

export async function createNfs(accessToken: string, input: CreateNfsInput): Promise<NonFinancialSupportItem> {
  const response = await fetch(`${apiBaseUrl}/api/clients/${input.clientId}/nfs`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  })
  return parseResponse<NonFinancialSupportItem>(response)
}
