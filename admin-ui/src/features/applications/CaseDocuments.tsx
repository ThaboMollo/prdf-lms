import { useMemo, useState } from 'react'
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
 * Documents tab (ADM-051): a checklist on the left, an inline preview on the
 * right, with Download / Verify / Reject beneath it — read it, then decide,
 * without a download round-trip. Missing required docs show an upload prompt.
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

  const entries = useMemo<ChecklistEntry[]>(() => {
    const docs = docsQuery.data ?? []
    const byType = new Map<string, ApplicationDocument>()
    for (const doc of docs) byType.set(doc.docType, doc)

    const required = docRequirements.map((req) => ({
      type: req.docType,
      label: DOCUMENT_LABELS[req.docType] ?? req.docType,
      doc: byType.get(req.docType)
    }))
    const extras = docs
      .filter((doc) => !docRequirements.some((req) => req.docType === doc.docType))
      .map((doc) => ({ type: doc.docType, label: DOCUMENT_LABELS[doc.docType] ?? doc.docType, doc }))

    return [...required, ...extras]
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

  if (docsQuery.isLoading) return <p>Loading documents…</p>
  if (!entries.length) return <EmptyState title="No document requirements" message="No documents are required for this case yet." />

  return (
    <div className="doc-split">
      <div className="doc-list" role="listbox" aria-label="Documents">
        {entries.map((entry) => (
          <button
            key={entry.type}
            type="button"
            role="option"
            aria-selected={selected?.type === entry.type}
            className={selected?.type === entry.type ? 'doc-item is-active' : 'doc-item'}
            onClick={() => setSelectedType(entry.type)}
          >
            <span className={`dot ${dotClass(entry.doc?.status)}`} />
            <span className="doc-name">{entry.label}</span>
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

            {urlQuery.isLoading ? (
              <div className="doc-frame" style={{ display: 'grid', placeItems: 'center' }}><p>Loading preview…</p></div>
            ) : urlQuery.data && previewKind(selectedDoc.storagePath) === 'pdf' ? (
              <iframe className="doc-frame" src={urlQuery.data} title={`${selected.label} preview`} />
            ) : urlQuery.data && previewKind(selectedDoc.storagePath) === 'image' ? (
              <div className="doc-frame"><img src={urlQuery.data} alt={`${selected.label} preview`} /></div>
            ) : (
              <div className="doc-frame" style={{ display: 'grid', placeItems: 'center' }}>
                <p>Preview not available for this file type — use Download.</p>
              </div>
            )}

            <div className="doc-bar">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={!urlQuery.data}
                onClick={() => urlQuery.data && window.open(urlQuery.data, '_blank', 'noopener,noreferrer')}
              >
                ⤓ Download
              </button>
              {selectedDoc.status !== 'Verified' ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => verifyMutation.mutate({ docId: selectedDoc.id, action: 'verify' })}
                  disabled={verifyMutation.isPending}
                >
                  Verify
                </button>
              ) : null}
              {selectedDoc.status !== 'Rejected' ? (
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => verifyMutation.mutate({ docId: selectedDoc.id, action: 'reject' })}
                  disabled={verifyMutation.isPending}
                >
                  Reject
                </button>
              ) : null}
            </div>
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
    </div>
  )
}
