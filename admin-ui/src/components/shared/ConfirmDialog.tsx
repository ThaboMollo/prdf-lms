import { useEffect, useRef, type ReactNode } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button red — use for irreversible/destructive actions. */
  danger?: boolean
  /** In-flight: disables both buttons and shows a spinner on confirm. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/**
 * A reusable confirmation gate for destructive or irreversible actions.
 * Focus moves to the confirm button on open and returns to the triggering
 * element on close; Tab is trapped inside the dialog; Escape and a scrim click
 * cancel (unless busy). Reuses the shared .modal-backdrop / .modal-card shell.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<Element | null>(null)

  // Move focus in on open, restore it to the trigger on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    confirmRef.current?.focus()
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [open])

  // Escape to cancel; Tab trapped between the dialog's buttons.
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onCancel()
        return
      }
      if (event.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
        if (!focusables || focusables.length === 0) return
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
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => { if (!busy) onCancel() }}>
      <div
        ref={dialogRef}
        className="modal-card confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="confirm-dialog-title">{title}</h2>
        </div>
        {children ? <div className="stack-sm">{children}</div> : null}
        <div className="inline-actions confirm-actions">
          <button
            ref={confirmRef}
            type="button"
            className={`btn${danger ? ' btn-danger' : ''}${busy ? ' btn-loading' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
