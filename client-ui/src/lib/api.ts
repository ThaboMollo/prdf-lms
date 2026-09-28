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
  // Parts of the derived loan name — see packages/domain/loanName.ts.
  // Joined by GET /api/applications; null for a client with no profile row yet.
  businessName?: string | null
  applicantFullName?: string | null
}

/**
 * The CURRENT client profile, joined onto the application.
 *
 * Not a snapshot: these columns live on public.clients, which the API rewrites
 * on every draft save (patchClientProfile), so a later application changes what
 * these say about an earlier one. Screens reviewing a submitted application
 * read draftState first and fall back to this.
 */
export type ApplicationClientDetails = {
  businessName: string | null
  registrationNo: string | null
  address: string | null
  fullName: string | null
  phone: string | null
  employmentStatus: string | null
  province: string | null
  spatialType: string | null
  industry: string | null
  gender: string | null
}

/**
 * Fields below `loanId` were already returned by GET /api/applications/:id
 * (see backend-node applications.service.ts getById) but were undeclared here,
 * so callers could not reach them without an assertion.
 */
export type ApplicationDetails = ApplicationSummary & {
  loanId?: string | null
  loanProductId?: string | null
  riskGrade?: string | null
  lastSavedAt?: string | null
  monthlyRevenue?: number | null
  yearsInOperation?: number | null
  numberOfEmployees?: number | null
  bankName?: string | null
  clientDetails?: ApplicationClientDetails | null
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
  // Parts of the derived loan name, joined from the originating application
  // so a loan reads the same here as on the Applications screens.
  businessName?: string | null
  applicantFullName?: string | null
  applicationCreatedAt?: string | null
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
  // Parts of the derived loan name, joined from the originating application
  // so a loan reads the same here as on the Applications screens.
  businessName?: string | null
  applicantFullName?: string | null
  applicationCreatedAt?: string | null
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

/** Fraction of the file sent so far, 0..1. */
export type UploadProgressHandler = (fraction: number) => void

/**
 * XMLHttpRequest rather than fetch: fetch exposes no upload progress at all
 * (a request ReadableStream is still not shipped everywhere, and Safari has
 * none), and the wizard's documents step needs a real per-file bar — a
 * three-month bank statement PDF over a mobile link is a long silence
 * otherwise.
 */
export function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
  onProgress?: UploadProgressHandler
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl, true)
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    request.upload.addEventListener('progress', (event) => {
      // lengthComputable is false for chunked bodies; report nothing rather
      // than a made-up number so the caller can fall back to indeterminate.
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total)
      }
    })

    // The bytes are on the wire once upload completes, but the object is not
    // durable until the response lands — hold the bar just short of full so
    // "100%" and "saved" mean the same thing.
    request.upload.addEventListener('load', () => onProgress?.(0.99))

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1)
        resolve()
        return
      }
      reject(new Error(`Upload failed: ${request.status} ${request.statusText}`))
    })
    request.addEventListener('error', () => reject(new Error('Upload failed: network error')))
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')))
    request.addEventListener('timeout', () => reject(new Error('Upload timed out.')))

    request.send(file)
  })
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
