import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDocumentsUseCases } from '../../logic/usecases/documents'
import { useActiveLoanProduct, useDocumentRequirements } from '../../lib/loanProduct'
import { DOCUMENT_LABELS } from '../../lib/requirements'
import { EmptyState } from '../../components/shared/EmptyState'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { useToast } from '../../components/shared/ToastProvider'
import { formatDateTime } from '../../lib/format'
import type { ApplicationDocument } from '../../lib/api'

type CaseDocumentsProps = {
  applicationId: string
  accessToken: string
}

type ChecklistEntry = { type: string; label: string; doc?: ApplicationDocument }

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

  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  const entries = useMemo<ChecklistEntry[]>(() => {
    const docs = docsQuery.data ?? []
    const byType = new Map<string, ApplicationDocument>()
    for (const doc of docs) byType.set(doc.docType, doc)

    // A doc type is listed in document_requirements once per status it's
    // required at, so the same type can appear several times — collapse to one
    // checklist entry per type (unique keys, no duplicate chips), requirements
    // first, then any uploaded types that aren't required.
    const seen = new Set<string>()
    const result: ChecklistEntry[] = []

    for (const req of docRequirements) {
      if (seen.has(req.docType)) continue
      seen.add(req.docType)
      result.push({ type: req.docType, label: DOCUMENT_LABELS[req.docType] ?? req.docType, doc: byType.get(req.docType) })
    }
    for (const doc of docs) {
      if (seen.has(doc.docType)) continue
      seen.add(doc.docType)
      result.push({ type: doc.docType, label: DOCUMENT_LABELS[doc.docType] ?? doc.docType, doc })
    }

    return result
  }, [docsQuery.data, docRequirements])

  const selected = entries.find((entry) => entry.type === selectedType)
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
      await queryClient.invalidateQueries({ queryKey: ['case-docs', applicationId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Upload failed.', 'error')
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
  if (!entries.length) return <EmptyState title="No document requirements" message="No documents are required for this case yet." />

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
      <div className="doc-chips" role="listbox" aria-label="Documents">
        {entries.map((entry) => (
          <button
            key={entry.type}
            type="button"
            role="option"
            aria-selected={selected?.type === entry.type}
            className={selected?.type === entry.type ? 'doc-chip is-active' : 'doc-chip'}
            onClick={() => setSelectedType(entry.type)}
          >
            <span className={`dot ${dotClass(entry.doc?.status)}`} />
            <span className="doc-chip__label">{entry.label}</span>
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
        ) : (
          <div className="doc-upload">
            <p className="list-title" style={{ fontSize: '0.9rem' }}>{selected.label}</p>
            <p className="helper-text">This document has not been uploaded yet.</p>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
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
    </div>
  )
}
