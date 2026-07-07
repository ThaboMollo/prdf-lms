import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CONSENT_ITEMS,
  CONSENT_SECTIONS,
  CONSENT_VERSION,
  type ConsentPayload,
} from '../../features/consent/consentItems'

type ConsentModalProps = {
  open: boolean
  submitting?: boolean
  onClose: () => void
  onProceed: (payload: ConsentPayload) => void
}

type Answer = 'yes' | 'no'

export function ConsentModal({ open, submitting = false, onClose, onProceed }: ConsentModalProps) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [showError, setShowError] = useState(false)

  // Reset when the modal is reopened.
  useEffect(() => {
    if (open) {
      setAnswers({})
      setShowError(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  const allAcknowledged = useMemo(
    () => CONSENT_ITEMS.every((item) => answers[item.key] === 'yes'),
    [answers],
  )

  if (!open) return null

  function handleProceed() {
    if (!allAcknowledged) {
      setShowError(true)
      return
    }
    onProceed({
      version: CONSENT_VERSION,
      items: CONSENT_ITEMS.map((item) => ({
        key: item.key,
        section: item.section,
        prompt: item.prompt,
        answer: true,
      })),
    })
  }

  return createPortal(
    <div className="modal-backdrop consent-backdrop" role="presentation">
      <section
        className="modal-card consent-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <header className="consent-header">
          <h2 id="consent-title">I hereby acknowledge my consent to the following:</h2>
          <button
            type="button"
            className="consent-close"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <div className="consent-body">
          {CONSENT_SECTIONS.map((section) => {
            const items = CONSENT_ITEMS.filter((i) => i.section === section.id)
            if (!items.length) return null
            return (
              <div key={section.id} className="consent-section">
                <h3 className="consent-section__title">{section.title}</h3>
                {items.map((item) => {
                  const value = answers[item.key]
                  const missing = showError && value !== 'yes'
                  return (
                    <div
                      key={item.key}
                      className={`consent-item${missing ? ' consent-item--missing' : ''}`}
                    >
                      <p className="consent-item__prompt" id={`consent-${item.key}`}>
                        {item.prompt}
                      </p>
                      <div className="consent-item__answers" role="radiogroup" aria-labelledby={`consent-${item.key}`}>
                        <label className="consent-radio consent-radio--yes">
                          <input
                            type="radio"
                            name={item.key}
                            checked={value === 'yes'}
                            disabled={submitting}
                            onChange={() => setAnswers((prev) => ({ ...prev, [item.key]: 'yes' }))}
                          />
                          <span>YES</span>
                        </label>
                        <label className="consent-radio consent-radio--no">
                          <input
                            type="radio"
                            name={item.key}
                            checked={value === 'no'}
                            disabled={submitting}
                            onChange={() => setAnswers((prev) => ({ ...prev, [item.key]: 'no' }))}
                          />
                          <span>NO</span>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {showError && !allAcknowledged ? (
          <p className="consent-error" role="alert">
            You must answer YES to every item to proceed. If you do not consent, you cannot continue with the application.
          </p>
        ) : null}

        <footer className="consent-footer">
          <button
            type="button"
            className={`btn btn-primary${submitting ? ' btn-loading' : ''}`}
            onClick={handleProceed}
            disabled={submitting || !allAcknowledged}
          >
            Proceed
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
