import { useEffect, useMemo, useRef, useState } from 'react'
import { DOCUMENT_LABELS } from '../../lib/requirements'
import { FieldError, fieldDomId, fieldErrorAttrs } from '../../components/shared/FieldError'
import type { CreateDocumentRequestInput } from '../../lib/api'

/**
 * File types a reviewer may ask for.
 *
 * Must stay a subset of ALLOWED_DOCUMENT_EXTENSIONS in
 * backend-node/src/common/file-validation.ts — offering, say, JPEG here would
 * let a reviewer ask for a file the upload endpoint then refuses, leaving the
 * applicant stuck with no way to satisfy the request.
 */
const FILE_TYPES = [
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'doc', label: 'Word 97–2003 (.doc)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'any', label: 'Any accepted type (.pdf, .doc, .docx)' }
] as const

type RequestDocumentModalProps = {
  open: boolean
  /** Doc types already requested and still outstanding — disabled in the picker. */
  outstandingTypes: string[]
  busy: boolean
  onSubmit: (input: CreateDocumentRequestInput) => void
  onCancel: () => void
}

/**
 * Asks the applicant for one document (ADM-0xx).
 *
 * The type picker is the shared checklist, plus "Other…" for anything not on
 * it. Choosing Other swaps in a name field — that name is what the applicant
 * sees, so it is required, whereas details are optional for a listed type
 * whose meaning is already documented in DOCUMENT_LABELS.
 */
export function RequestDocumentModal({
  open,
  outstandingTypes,
  busy,
  onSubmit,
  onCancel
}: RequestDocumentModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const firstFieldRef = useRef<HTMLSelectElement | null>(null)
  const previouslyFocused = useRef<Element | null>(null)

  const [docType, setDocType] = useState('')
  const [customName, setCustomName] = useState('')
  const [details, setDetails] = useState('')
  const [fileType, setFileType] = useState<string>('pdf')
  const [touched, setTouched] = useState(false)

  const documentTypes = useMemo(
    () => Object.entries(DOCUMENT_LABELS).map(([value, label]) => ({ value, label })),
    []
  )

  // Fresh form each time it opens — a stale half-typed "Other" name carried
  // over from a cancelled request is a wrong-document-requested waiting to
  // happen.
  useEffect(() => {
    if (!open) return
    setDocType('')
    setCustomName('')
    setDetails('')
    setFileType('pdf')
    setTouched(false)
    previouslyFocused.current = document.activeElement
    firstFieldRef.current?.focus()
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel()
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])'
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const isOther = docType === 'Other'
  const trimmedName = customName.trim()
  const typeError = touched && !docType ? 'Choose the document you need.' : null
  const nameError = touched && isOther && !trimmedName ? 'Give the document a name the applicant will recognise.' : null
  const canSubmit = Boolean(docType) && (!isOther || Boolean(trimmedName))

  function submit() {
    setTouched(true)
    if (!canSubmit || busy) return
    onSubmit({
      docType,
      customName: isOther ? trimmedName : undefined,
      details: details.trim() || undefined,
      fileType
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => { if (!busy) onCancel() }}>
      <div
        ref={dialogRef}
        className="modal-card request-doc-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-doc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="request-doc-title">Request a document</h2>
            <p className="helper-text">
              The applicant is notified and gets an upload slot for this document on their status page.
            </p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field-block">
            <label htmlFor={fieldDomId('docType', 'doc-request')}>Document type</label>
            <select
              ref={firstFieldRef}
              id={fieldDomId('docType', 'doc-request')}
              {...fieldErrorAttrs('docType', typeError ?? undefined, 'doc-request')}
              value={docType}
              onChange={(event) => setDocType(event.target.value)}
              disabled={busy}
            >
              <option value="">Select a document…</option>
              {documentTypes.map((type) => (
                <option key={type.value} value={type.value} disabled={outstandingTypes.includes(type.value)}>
                  {outstandingTypes.includes(type.value) ? `${type.label} — already requested` : type.label}
                </option>
              ))}
              <option value="Other">Other (not on this list)…</option>
            </select>
            <FieldError field="docType" idPrefix="doc-request" message={typeError ?? undefined} />
          </div>

          {isOther ? (
            <div className="field-block">
              <label htmlFor={fieldDomId('customName', 'doc-request')}>Document name</label>
              <input
                id={fieldDomId('customName', 'doc-request')}
                {...fieldErrorAttrs('customName', nameError ?? undefined, 'doc-request')}
                type="text"
                value={customName}
                maxLength={200}
                placeholder="e.g. Signed lease agreement"
                onChange={(event) => setCustomName(event.target.value)}
                disabled={busy}
              />
              <FieldError field="customName" idPrefix="doc-request" message={nameError ?? undefined} />
            </div>
          ) : null}

          <div className="field-block">
            <label htmlFor={fieldDomId('details', 'doc-request')}>Details (optional)</label>
            <textarea
              id={fieldDomId('details', 'doc-request')}
              rows={3}
              value={details}
              maxLength={2000}
              placeholder="Where to find it, or what it must show — e.g. From your municipality, dated within the last 3 months."
              onChange={(event) => setDetails(event.target.value)}
              disabled={busy}
            />
            <p className="helper-text">Shown to the applicant word for word.</p>
          </div>

          <div className="field-block">
            <label htmlFor={fieldDomId('fileType', 'doc-request')}>File type</label>
            <select
              id={fieldDomId('fileType', 'doc-request')}
              value={fileType}
              onChange={(event) => setFileType(event.target.value)}
              disabled={busy}
            >
              {FILE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="inline-actions confirm-actions">
          <button type="button" className={`btn${busy ? ' btn-loading' : ''}`} onClick={submit} disabled={busy}>
            {busy ? '' : 'Send request'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
