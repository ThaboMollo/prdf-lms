import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDropzone } from './FileDropzone'
import { useToast } from './ToastProvider'
import { formatDateTime } from '../../lib/format'
import { DOCUMENT_LABELS } from '../../lib/requirements'
import type { DocumentRequest } from '../../lib/api'
import { createDocumentsUseCases } from '../../logic/usecases/documents'

/**
 * What the dropzone accepts, per the request's `fileType`.
 *
 * Kept aligned with ALLOWED_DOCUMENT_EXTENSIONS in
 * backend-node/src/common/file-validation.ts. 'any' is the full accepted list
 * rather than an unrestricted picker — offering a type the API rejects would
 * only surface as a failed upload after the applicant waited for it.
 */
function acceptFor(fileType: string): string {
  if (fileType === 'any') return '.pdf,.doc,.docx'
  return `.${fileType}`
}

function labelFor(request: DocumentRequest): string {
  return request.customName ?? DOCUMENT_LABELS[request.docType]?.label ?? request.docType
}

type RequestedDocumentsProps = {
  applicationId: string
  accessToken: string
}

/**
 * The applicant's side of an admin-raised document request.
 *
 * Sits on the status card for the application it belongs to, because that is
 * where an applicant looks to find out what is holding their loan up — and an
 * ask with no upload slot next to it is the thing this feature exists to
 * replace. Renders nothing at all when there is nothing outstanding, so a
 * normal application's status card is unchanged.
 */
export function RequestedDocuments({ applicationId, accessToken }: RequestedDocumentsProps) {
  const documentsUseCases = useMemo(() => createDocumentsUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()
  const toast = useToast()

  const [openRequestId, setOpenRequestId] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])

  const requestsQuery = useQuery({
    queryKey: ['document-requests', applicationId],
    queryFn: () => documentsUseCases.getDocumentRequests(applicationId)
  })

  const uploadMutation = useMutation({
    mutationFn: ({ request, file }: { request: DocumentRequest; file: File }) =>
      documentsUseCases.uploadForRequest(applicationId, request.id, request.docType, file),
    onSuccess: async (_document, variables) => {
      toast.push(`${labelFor(variables.request)} uploaded.`, 'success')
      setOpenRequestId(null)
      setFiles([])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['document-requests', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['documents', applicationId] })
      ])
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Upload failed.', 'error')
  })

  const outstanding = (requestsQuery.data ?? []).filter((request) => request.status === 'Pending')

  // A failed fetch is not the same as nothing outstanding, and `data ?? []`
  // collapses the two. Rendering null on an error hides the one thing the
  // panel exists to say — the applicant sees a normal status card and waits
  // for a document nobody told them about, while the reviewer sees the ask
  // sitting unanswered. Say so instead, and offer the retry.
  if (requestsQuery.isError) {
    return (
      <div className="doc-request-panel">
        <div className="doc-request-panel__head">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h3>We could not check for requested documents</h3>
            <p className="muted-text">
              There may be a document waiting for you. Try again, or refresh the page.
            </p>
          </div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => requestsQuery.refetch()}
            disabled={requestsQuery.isFetching}
          >
            {requestsQuery.isFetching ? 'Checking…' : 'Try again'}
          </button>
        </div>
      </div>
    )
  }

  // Silence is the right output here: an applicant with nothing outstanding
  // should not see an empty "requested documents" panel implying otherwise.
  if (!outstanding.length) return null

  return (
    <div className="doc-request-panel">
      <div className="doc-request-panel__head">
        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
        <div>
          <h3>
            {outstanding.length === 1 ? 'A document has been requested' : `${outstanding.length} documents have been requested`}
          </h3>
          <p className="muted-text">
            Upload {outstanding.length === 1 ? 'it' : 'them'} here to keep your application moving.
          </p>
        </div>
      </div>

      <ul className="list-clean">
        {outstanding.map((request) => {
          const isOpen = openRequestId === request.id
          const busy = uploadMutation.isPending && isOpen

          return (
            <li key={request.id} className="doc-request-item">
              <button
                type="button"
                className="doc-request-item__summary"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenRequestId(isOpen ? null : request.id)
                  setFiles([])
                }}
              >
                <span className="doc-request-item__text">
                  <span className="list-title">{labelFor(request)}</span>
                  {request.customName ? (
                    <small className="doc-request-item__type">Other document</small>
                  ) : null}
                  {request.details ? <small className="doc-request-item__details">{request.details}</small> : null}
                  <small className="muted-text">
                    {request.fileType === 'any' ? 'PDF or Word file' : `${request.fileType.toUpperCase()} file`}
                    {' · requested '}
                    {formatDateTime(request.requestedAt)}
                  </small>
                </span>
                <span className="status-badge status-alert">{isOpen ? 'Close' : 'Upload'}</span>
              </button>

              {isOpen ? (
                <div className="doc-request-item__upload">
                  <FileDropzone
                    label={labelFor(request)}
                    accept={acceptFor(request.fileType)}
                    files={files}
                    onFilesChange={setFiles}
                    hint={
                      request.fileType === 'any'
                        ? 'Drop your PDF or Word file here.'
                        : `Drop your .${request.fileType} file here.`
                    }
                  />
                  <button
                    className={`btn btn-primary${busy ? ' btn-loading' : ''}`}
                    type="button"
                    disabled={!files.length || uploadMutation.isPending}
                    onClick={() => uploadMutation.mutate({ request, file: files[0] })}
                  >
                    {busy ? '' : 'Upload document'}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
