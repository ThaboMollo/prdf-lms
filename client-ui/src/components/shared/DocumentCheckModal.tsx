import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type DocumentCheckItem = {
  docType: string
  label: string
  uploaded: number
  expected: number
}

type DocumentCheckModalProps = {
  open: boolean
  /** Slots holding fewer files than expected. Empty means everything is in order. */
  shortfalls: DocumentCheckItem[]
  totalFiles: number
  onClose: () => void
  onProceed: () => void
}

/**
 * Last look at the document set before the review step.
 *
 * Shown on every "Review Application", not only when something is short: a
 * confirmation that appears only on a problem trains people to click straight
 * through it, and the count an applicant most often gets wrong — one combined
 * bank-statement PDF instead of three months — is precisely the one the
 * uploader cannot reject, since allows_multiple is a boolean (see
 * lib/requirements.ts). So the shortfalls warn and the clean case confirms,
 * and neither blocks.
 */
export function DocumentCheckModal({
  open,
  shortfalls,
  totalFiles,
  onClose,
  onProceed,
}: DocumentCheckModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const hasShortfalls = shortfalls.length > 0

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-card doc-check-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-check-title"
      >
        <header className={`doc-check-header${hasShortfalls ? ' doc-check-header--warn' : ' doc-check-header--ok'}`}>
          <span className="doc-check-header__icon" aria-hidden="true">
            <i className={`fa-solid ${hasShortfalls ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
          </span>
          <div>
            <h2 id="doc-check-title">
              {hasShortfalls ? 'Some documents look incomplete' : 'All documents attached'}
            </h2>
            <p>
              {hasShortfalls
                ? 'You can still continue — check these first if the count looks wrong.'
                : `${totalFiles} file${totalFiles !== 1 ? 's' : ''} uploaded across every required document.`}
            </p>
          </div>
        </header>

        {hasShortfalls && (
          <ul className="doc-check-list">
            {shortfalls.map((item) => (
              <li key={item.docType} className="doc-check-list__item">
                <span className="doc-check-list__label">{item.label}</span>
                <span className="doc-check-list__count">
                  {item.uploaded} of {item.expected} file{item.expected !== 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        <footer className="doc-check-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {hasShortfalls ? 'Add more files' : 'Back to documents'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onProceed}>
            Continue to review →
          </button>
        </footer>
      </section>
    </div>,
    document.body
  )
}
