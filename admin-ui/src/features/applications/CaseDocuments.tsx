import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDocumentsUseCases } from '../../logic/usecases/documents'
import { useActiveLoanProduct, useDocumentRequirements } from '../../lib/loanProduct'
import { DOCUMENT_LABELS } from '../../lib/requirements'
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_MAX_SIZE_LABEL,
} from '../../../../packages/domain/constraints'
import { EmptyState } from '../../components/shared/EmptyState'
import { RequestDocumentModal } from './RequestDocumentModal'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { useToast } from '../../components/shared/ToastProvider'
import { formatDateTime } from '../../lib/format'
import type { ApplicationDocument, CreateDocumentRequestInput, DocumentRequest } from '../../lib/api'

type CaseDocumentsProps = {
  applicationId: string
  accessToken: string
}

/**
 * One chip. `key` is what identifies it, not `type`: a request for an "Other"
 * document has no checklist type to key on, and two of them on one case would
 * collapse into a single chip if they did.
 */
type ChecklistEntry = {
  key: string
  type: string
  label: string
  doc?: ApplicationDocument
  request?: DocumentRequest
}

function previewKind(storagePath: string): 'pdf' | 'image' | 'other' {
  const lower = storagePath.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return 'image'
  return 'other'
}

function dotClass(status?: string): string {
  if (!status) return 'dot-missing'
  if (status === 'Verified') return 'dot-ok'
  if (status === 'Rejected') return 'dot-missing'
  return 'dot-pending'
}

/**
 * Documents tab (ADM-051, redesigned): a horizontal status-chip picker over a
 * full-width preview, with Download / Full screen / Verify / Reject beneath it.
 * "Full screen" opens a lightbox for reading a full A4 document. Stacking the
 * picker above the preview (rather than a third side column) is what keeps this
 * tab from overflowing the case layout's actions rail.
 *
 * ⚠ Inline preview embeds the signed URL from getDocumentUrl. If storage serves
 * the object with Content-Disposition: attachment (ADM-050), the browser will
 * download instead of render — the Download button always works regardless.
 */
export function CaseDocuments({ applicationId, accessToken }: CaseDocumentsProps) {
  const documentsUseCases = useMemo(() => createDocumentsUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()
  const toast = useToast()

  const docsQuery = useQuery({
    queryKey: ['case-docs', applicationId],
    queryFn: () => documentsUseCases.getDocuments(applicationId)
  })
  const { data: activeLoanProduct } = useActiveLoanProduct()
  const { data: docRequirements = [] } = useDocumentRequirements(activeLoanProduct?.id, accessToken)

  const requestsQuery = useQuery({
    queryKey: ['case-doc-requests', applicationId],
    queryFn: () => documentsUseCases.getDocumentRequests(applicationId)
  })
  const requests = requestsQuery.data ?? []
  const openRequests = requests.filter((request) => request.status === 'Pending')

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  /**
   * Same gate the applicant's FileDropzone applies, for the same reason.
   *
   * This input had no `accept` and no size check, so a staff member picking a
   * 12 MB scan or a .jpg got an opaque failure from Supabase Storage after the
   * upload had already started, while an applicant doing the identical thing
   * got a sentence naming the problem. The API rejects the wrong type at
   * presign and the bucket caps size at 5 MB either way — this just says so
   * before the attempt rather than after.
   */
  function chooseFile(picked: File | null) {
    if (!picked) {
      setFile(null)
      setFileError(null)
      return
    }
    const extension = picked.name.slice(picked.name.lastIndexOf('.')).toLowerCase()
    if (!(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
      setFile(null)
      setFileError(`Only ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')} files are accepted.`)
      return
    }
    if (picked.size > DOCUMENT_MAX_SIZE_BYTES) {
      setFile(null)
      setFileError(`${picked.name} is larger than ${DOCUMENT_MAX_SIZE_LABEL}. Compress it or split it, then try again.`)
      return
    }
    setFile(picked)
    setFileError(null)
  }
  const [fullscreen, setFullscreen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  const entries = useMemo<ChecklistEntry[]>(() => {
    const docs = docsQuery.data ?? []
    const liveRequests = requests.filter((request) => request.status !== 'Cancelled')

    // A document that answered a request belongs to that request's chip, not to
    // the generic checklist chip for its type — otherwise it shows twice, once
    // under each.
    const claimed = new Set(
      liveRequests.map((request) => request.fulfilledDocumentId).filter((id): id is string => Boolean(id))
    )
    const byId = new Map(docs.map((doc) => [doc.id, doc]))
    const byType = new Map<string, ApplicationDocument>()
    for (const doc of docs) {
      if (claimed.has(doc.id)) continue
      if (!byType.has(doc.docType)) byType.set(doc.docType, doc)
    }

    const result: ChecklistEntry[] = []

    // Requests first: they are what this case is currently waiting on.
    for (const request of liveRequests) {
      result.push({
        key: `req:${request.id}`,
        type: request.docType,
        label: request.customName ?? DOCUMENT_LABELS[request.docType] ?? request.docType,
        doc: request.fulfilledDocumentId ? byId.get(request.fulfilledDocumentId) : undefined,
        request
      })
    }

    // A doc type is listed in document_requirements once per status it's
    // required at, so the same type can appear several times — collapse to one
    // checklist entry per type (unique keys, no duplicate chips), requirements
    // first, then any uploaded types that aren't required.
    const seen = new Set<string>()
    for (const req of docRequirements) {
      if (seen.has(req.docType)) continue
      seen.add(req.docType)
      result.push({
        key: `type:${req.docType}`,
        type: req.docType,
        label: DOCUMENT_LABELS[req.docType] ?? req.docType,
        doc: byType.get(req.docType)
      })
    }
    for (const doc of docs) {
      if (claimed.has(doc.id) || seen.has(doc.docType)) continue
      seen.add(doc.docType)
      result.push({
        key: `type:${doc.docType}`,
        type: doc.docType,
        label: DOCUMENT_LABELS[doc.docType] ?? doc.docType,
        doc
      })
    }

    return result
  }, [docsQuery.data, docRequirements, requests])

  const selected = entries.find((entry) => entry.key === selectedKey)
    ?? entries.find((entry) => entry.doc)
    ?? entries[0]
  const selectedDoc = selected?.doc

  const urlQuery = useQuery({
    queryKey: ['case-doc-url', applicationId, selectedDoc?.id],
    queryFn: () => documentsUseCases.getDocumentUrl(applicationId, selectedDoc!.id),
    enabled: Boolean(selectedDoc)
  })

  const verifyMutation = useMutation({
    mutationFn: ({ docId, action }: { docId: string; action: 'verify' | 'reject' }) =>
      action === 'verify'
        ? documentsUseCases.verifyDocument(applicationId, docId)
        : documentsUseCases.rejectDocument(applicationId, docId),
    onSuccess: async () => {
      toast.push('Document status updated.', 'success')
      await queryClient.invalidateQueries({ queryKey: ['case-docs', applicationId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Could not update document.', 'error')
  })

  const uploadMutation = useMutation({
    mutationFn: () => documentsUseCases.uploadDocumentFlow(applicationId, selected!.type, file as File, 'Uploaded'),
    onSuccess: async () => {
      toast.push('Document uploaded.', 'success')
      setFile(null)
      setFileError(null)
      await queryClient.invalidateQueries({ queryKey: ['case-docs', applicationId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Upload failed.', 'error')
  })

  const requestMutation = useMutation({
    mutationFn: (input: CreateDocumentRequestInput) => documentsUseCases.requestDocument(applicationId, input),
    onSuccess: async (created) => {
      toast.push('Document requested. The applicant has been notified.', 'success')
      setRequestOpen(false)
      setSelectedKey(`req:${created.id}`)
      await queryClient.invalidateQueries({ queryKey: ['case-doc-requests', applicationId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Could not request the document.', 'error')
  })

  const cancelRequestMutation = useMutation({
    mutationFn: (requestId: string) => documentsUseCases.cancelDocumentRequest(applicationId, requestId),
    onSuccess: async () => {
      toast.push('Document request withdrawn.', 'success')
      setSelectedKey(null)
      await queryClient.invalidateQueries({ queryKey: ['case-doc-requests', applicationId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Could not withdraw the request.', 'error')
  })

  const kind = selectedDoc ? previewKind(selectedDoc.storagePath) : 'other'
  const canPreview = Boolean(urlQuery.data) && (kind === 'pdf' || kind === 'image')

  // Close the lightbox on Escape and lock body scroll while it's open.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  // A missing selection can't be shown full screen — close the lightbox if the
  // preview becomes unavailable (e.g. after switching to a not-yet-uploaded doc).
  useEffect(() => {
    if (fullscreen && !canPreview) setFullscreen(false)
  }, [fullscreen, canPreview])

  if (docsQuery.isLoading) return <p>Loading documents…</p>

  const renderPreview = (variant: 'inline' | 'full') => {
    const frameClass = variant === 'full' ? 'doc-frame doc-frame--full' : 'doc-frame'
    if (urlQuery.isLoading) {
      return <div className={frameClass} style={{ display: 'grid', placeItems: 'center' }}><p>Loading preview…</p></div>
    }
    if (urlQuery.data && kind === 'pdf') {
      return <iframe className={frameClass} src={urlQuery.data} title={`${selected?.label ?? 'Document'} preview`} />
    }
    if (urlQuery.data && kind === 'image') {
      return <div className={frameClass}><img src={urlQuery.data} alt={`${selected?.label ?? 'Document'} preview`} /></div>
    }
    return (
      <div className={frameClass} style={{ display: 'grid', placeItems: 'center' }}>
        <p>Preview not available for this file type — use Download.</p>
      </div>
    )
  }

  const actionButtons = (
    <>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={!urlQuery.data}
        onClick={() => urlQuery.data && window.open(urlQuery.data, '_blank', 'noopener,noreferrer')}
      >
        ⤓ Download
      </button>
      {canPreview ? (
        <button className="btn btn-secondary" type="button" onClick={() => setFullscreen((open) => !open)}>
          {fullscreen ? '⤡ Exit full screen' : '⤢ Full screen'}
        </button>
      ) : null}
      {selectedDoc && selectedDoc.status !== 'Verified' ? (
        <button
          className="btn"
          type="button"
          onClick={() => verifyMutation.mutate({ docId: selectedDoc.id, action: 'verify' })}
          disabled={verifyMutation.isPending}
        >
          Verify
        </button>
      ) : null}
      {selectedDoc && selectedDoc.status !== 'Rejected' ? (
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => verifyMutation.mutate({ docId: selectedDoc.id, action: 'reject' })}
          disabled={verifyMutation.isPending}
        >
          Reject
        </button>
      ) : null}
    </>
  )

  return (
    <div className="doc-stack">
      <div className="doc-head">
        <p className="helper-text" style={{ margin: 0 }}>
          {/* `data ?? []` makes a failed fetch indistinguishable from an empty
              one, and the empty copy actively reassures ("ask for anything
              missing") a reviewer who may in fact have asks outstanding. It
              also empties outstandingTypes below, so the modal stops
              suppressing a type that is already pending. Say the fetch failed. */}
          {requestsQuery.isError
            ? 'Could not load requested documents — this case may have outstanding asks that are not shown.'
            : openRequests.length
            ? `Waiting on the applicant for ${openRequests.length} requested document${openRequests.length === 1 ? '' : 's'}.`
            : 'Ask the applicant for anything missing — they get an upload slot for it on their status page.'}
        </p>
        <button className="btn" type="button" onClick={() => setRequestOpen(true)}>
          Request document
        </button>
      </div>

      {!entries.length ? (
        <EmptyState
          title="No documents yet"
          message="No documents are required for this case and none have been requested."
        />
      ) : null}

      {/* The picker and the preview frame are chrome around a selection. With
          nothing to select they are an empty bordered box, so the empty state
          above stands alone instead. */}
      {entries.length ? (
      <>
      <div className="doc-chips" role="listbox" aria-label="Documents">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="option"
            aria-selected={selected?.key === entry.key}
            className={selected?.key === entry.key ? 'doc-chip is-active' : 'doc-chip'}
            onClick={() => setSelectedKey(entry.key)}
          >
            <span className={`dot ${dotClass(entry.doc?.status)}`} />
            <span className="doc-chip__label">{entry.label}</span>
            {entry.request?.status === 'Pending' ? <span className="doc-chip__tag">Requested</span> : null}
          </button>
        ))}
      </div>

      <div className="doc-view">
        {!selected ? null : selectedDoc ? (
          <>
            <div className="doc-view__head">
              <div style={{ minWidth: 0 }}>
                <p className="list-title" style={{ fontSize: '0.9rem' }}>{selected.label}</p>
                <small>Uploaded {formatDateTime(selectedDoc.uploadedAt)}</small>
              </div>
              <span style={{ marginLeft: 'auto' }}><StatusBadge status={selectedDoc.status} /></span>
            </div>

            {renderPreview('inline')}

            <div className="doc-bar">{actionButtons}</div>
          </>
        ) : selected.request?.status === 'Pending' ? (
          <div className="doc-upload">
            <p className="list-title" style={{ fontSize: '0.9rem' }}>{selected.label}</p>
            <p className="helper-text">
              Requested {formatDateTime(selected.request.requestedAt)} — waiting on the applicant.
            </p>
            {selected.request.details ? <p className="doc-request__details">{selected.request.details}</p> : null}
            <p className="helper-text">
              Asked for as {selected.request.fileType === 'any' ? 'any accepted file type' : `a .${selected.request.fileType} file`}.
            </p>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => cancelRequestMutation.mutate(selected.request!.id)}
              disabled={cancelRequestMutation.isPending}
            >
              {cancelRequestMutation.isPending ? 'Withdrawing…' : 'Withdraw request'}
            </button>
          </div>
        ) : (
          <div className="doc-upload">
            <p className="list-title" style={{ fontSize: '0.9rem' }}>{selected.label}</p>
            <p className="helper-text">This document has not been uploaded yet.</p>
            <input
              type="file"
              accept={ALLOWED_DOCUMENT_EXTENSIONS.join(',')}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <p className="helper-text">
              {ALLOWED_DOCUMENT_EXTENSIONS.join(', ')} · up to {DOCUMENT_MAX_SIZE_LABEL}
            </p>
            {fileError ? <p className="field-error" role="alert">{fileError}</p> : null}
            <button
              className="btn"
              type="button"
              onClick={() => uploadMutation.mutate()}
              disabled={!file || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Upload document'}
            </button>
          </div>
        )}
      </div>
      </>
      ) : null}

      {fullscreen && selectedDoc ? (
        <div
          className="doc-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected?.label ?? 'Document'} preview`}
          onClick={(event) => { if (event.target === event.currentTarget) setFullscreen(false) }}
        >
          <div className="doc-lightbox__panel">
            <div className="doc-view__head">
              <div style={{ minWidth: 0 }}>
                <p className="list-title" style={{ fontSize: '0.95rem' }}>{selected?.label}</p>
                <small>Uploaded {formatDateTime(selectedDoc.uploadedAt)}</small>
              </div>
              <span style={{ marginLeft: 'auto' }}><StatusBadge status={selectedDoc.status} /></span>
              <button className="btn btn-secondary" type="button" onClick={() => setFullscreen(false)} aria-label="Close full screen">✕</button>
            </div>
            {renderPreview('full')}
            <div className="doc-bar">{actionButtons}</div>
          </div>
        </div>
      ) : null}

      <RequestDocumentModal
        open={requestOpen}
        outstandingTypes={openRequests.map((request) => request.docType)}
        busy={requestMutation.isPending}
        onSubmit={(input) => requestMutation.mutate(input)}
        onCancel={() => setRequestOpen(false)}
      />
    </div>
  )
}
