import { env } from './config/env'
import type { LoanApplicationStatus } from '../../../packages/domain/status'

export type { LoanApplicationStatus }

export type MeResponse = {
  userId: string
  email: string | null
  fullName: string | null
  roles: string[]
}

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

export type ApplicationDetails = ApplicationSummary & {
  loanId?: string | null
  // Draft resume fields (present on Draft rows saved by the apply wizard).
  currentStep?: number | null
  draftState?: Record<string, unknown> | null
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
  province?: string
  spatialType?: string
  industry?: string
  gender?: string
  isDisabled?: boolean
  isHdp?: boolean
  isRural?: boolean
  isBlackWomenOwned?: boolean
  saCitizenshipPercentage?: number
  isDirectorOperational?: boolean
  cipcRegistered?: boolean
  sarsTaxPin?: string
  insolventOrDebtReview?: boolean
  assignedToUserId?: string
  consent?: ApplicationConsentInput
  // Step-2 financials (persisted for resumable drafts).
  monthlyRevenue?: number
  yearsInOperation?: number
  numberOfEmployees?: number
  bankName?: string
  // Draft resume metadata (hybrid storage).
  currentStep?: number
  draftState?: Record<string, unknown> | null
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

export type LoanSummary = {
  id: string
  applicationId: string
  principalAmount: number
  outstandingPrincipal: number
  termMonths: number
  status: LoanStatus
  disbursedAt: string | null
  createdAt: string
}

export type PortfolioSummary = {
  totalLoans: number
  activeLoans: number
  totalPrincipal: number
  outstandingPrincipal: number
  repaidPrincipal: number
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

const apiBaseUrl = env.VITE_API_BASE_URL

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let details = ''
    try {
      details = await response.text()
    } catch {
      details = ''
    }
    throw new Error(`API ${response.status}: ${details || response.statusText}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const response = await fetch(`${apiBaseUrl}/me`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<MeResponse>(response)
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

export async function deleteDocument(accessToken: string, applicationId: string, documentId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/documents/${documentId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken)
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

/** The signed-in client's current open Draft, if any — null if none exists. */
export async function getMyDraft(accessToken: string): Promise<ApplicationSummary | null> {
  const response = await fetch(`${apiBaseUrl}/api/applications/draft`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<ApplicationSummary | null>(response)
}

export async function recordConsent(accessToken: string, applicationId: string, consent: ApplicationConsentInput): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/consent`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(consent)
  })
  await parseResponse<void>(response)
}

export async function deleteApplication(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/applications/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken)
  })
  await parseResponse<void>(response)
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

/** Role-scoped server-side to the caller's own loans for a Client actor — no client-side filtering needed. */
export async function listMyLoans(accessToken: string): Promise<LoanSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/loans`, {
    headers: authHeaders(accessToken)
  })
  return parseResponse<LoanSummary[]>(response)
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
