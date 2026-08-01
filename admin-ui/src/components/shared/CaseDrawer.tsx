import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createApplicationsUseCases } from '../../logic/usecases/applications'
import { formatCurrency, formatDateTime } from '../../lib/format'
import { LifecycleRail } from './LifecycleRail'
import { StatusBadge } from './StatusBadge'

type CaseDrawerContextValue = {
  /** Open the case-preview drawer for an application id. */
  open: (id: string) => void
  close: () => void
}

const CaseDrawerContext = createContext<CaseDrawerContextValue | null>(null)

export function useCaseDrawer(): CaseDrawerContextValue {
  const ctx = useContext(CaseDrawerContext)
  if (!ctx) {
    throw new Error('useCaseDrawer must be used within a CaseDrawerProvider.')
  }
  return ctx
}

type CaseDrawerProviderProps = {
  accessToken: string
  children: ReactNode
}

/**
 * Hosts the shared case-preview drawer and exposes open/close to any list
 * (Dashboard, Pipeline, Portfolio, …) via useCaseDrawer(). The drawer fetches
 * the case by id, so callers only pass an id.
 */
export function CaseDrawerProvider({ accessToken, children }: CaseDrawerProviderProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const value = useMemo<CaseDrawerContextValue>(
    () => ({ open: (id: string) => setOpenId(id), close: () => setOpenId(null) }),
    []
  )

  return (
    <CaseDrawerContext.Provider value={value}>
      {children}
      <CaseDrawerPanel accessToken={accessToken} openId={openId} onClose={value.close} />
    </CaseDrawerContext.Provider>
  )
}

type CaseDrawerPanelProps = {
  accessToken: string
  openId: string | null
  onClose: () => void
}

function CaseDrawerPanel({ accessToken, openId, onClose }: CaseDrawerPanelProps) {
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const panelRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const previouslyFocused = useRef<Element | null>(null)
  const isOpen = Boolean(openId)

  const detailsQuery = useQuery({
    queryKey: ['case-drawer', openId],
    queryFn: () => applicationsUseCases.getApplication(openId as string),
    enabled: isOpen
  })

  // Move focus into the drawer on open, restore it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [isOpen])

  // Escape to close; Tab trapped inside the panel.
  useEffect(() => {
    if (!isOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab') {
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
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
  }, [isOpen, onClose])

  const detail = detailsQuery.data
  const businessName = detail?.clientDetails?.businessName?.trim() || detail?.purpose || 'Case'
  const clientName = detail?.clientDetails?.fullName?.trim()

  return (
    <>
      <div
        className={`drawer-scrim${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={`case-drawer${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Case preview"
        aria-hidden={isOpen ? undefined : true}
      >
        {isOpen ? (
          <div className="case-drawer__body">
            <div className="case-drawer__head">
              <p className="case-drawer__eyebrow">Case preview</p>
              <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
                ✕
              </button>
            </div>

            {detailsQuery.isLoading ? (
              <p>Loading case…</p>
            ) : detailsQuery.isError || !detail ? (
              <p className="text-error">Could not load this case.</p>
            ) : (
              <>
                <div className="case-drawer__title-row">
                  <div>
                    <h2 className="drawer-title">{businessName}</h2>
                    <p className="drawer-meta">
                      {clientName ? `${clientName} · ` : ''}
                      {formatCurrency(detail.requestedAmount)} · #{detail.id.slice(0, 8)}
                    </p>
                  </div>
                  <StatusBadge status={detail.status} />
                </div>

                <LifecycleRail status={detail.status} />

                {detail.loanId ? (
                  <Link to={`/case/${detail.id}?tab=money`} className="drawer-loan" onClick={onClose}>
                    <div>
                      <strong>Loan created</strong>
                      <small>Disbursement &amp; repayments live in the case</small>
                    </div>
                    <span className="drawer-loan__go">Open cockpit →</span>
                  </Link>
                ) : null}

                <p className="drawer-meta">
                  Submitted {detail.submittedAt ? formatDateTime(detail.submittedAt) : '—'}
                </p>

                <div className="inline-actions case-drawer__actions">
                  <Link to={`/case/${detail.id}`} className="btn" onClick={onClose}>
                    Open full case →
                  </Link>
                  <Link
                    to={`/case/${detail.id}?tab=documents`}
                    className="btn btn-secondary"
                    onClick={onClose}
                  >
                    View documents
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : null}
      </aside>
    </>
  )
}
