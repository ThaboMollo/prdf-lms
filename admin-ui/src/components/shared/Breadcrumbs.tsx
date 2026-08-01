import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

export type Crumb = { label: string; to?: string }

// Known path sections → their label and (if they have an index route) their
// link target. Sections without a `to` (e.g. `loan`, `case`) need an id and so
// have no standalone page — they render as plain text, never a broken link.
const SECTION: Record<string, { label: string; to?: string }> = {
  dashboard: { label: 'Dashboard', to: '/dashboard' },
  applications: { label: 'Applications', to: '/applications' },
  pipeline: { label: 'Pipeline', to: '/pipeline' },
  loans: { label: 'Loans', to: '/loans' },
  loan: { label: 'Loan' },
  case: { label: 'Case' },
  portfolio: { label: 'Portfolio', to: '/portfolio' },
  reports: { label: 'Reports', to: '/reports' },
  'user-access': { label: 'User Access', to: '/user-access' }
}

function looksLikeId(segment: string): boolean {
  // uuids and short hex ids (e.g. `a3f19c`, a full uuid) — anything a route
  // param would carry rather than a named section.
  return /^[0-9a-fA-F-]{6,}$/.test(segment)
}

function titleCase(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Derives a breadcrumb trail from the current pathname. Dashboard is the
 * console's home, so it leads every trail; the final crumb is the current page
 * and never links. Pages that want a richer terminal label (a business name
 * instead of `#a3f19c…`) pass their own `items` to <Breadcrumbs>.
 */
export function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation()
  const segments = pathname.split('/').filter(Boolean)

  if (!segments.length) return [{ label: 'Dashboard' }]

  const crumbs: Crumb[] = []
  if (segments[0] !== 'dashboard') {
    crumbs.push({ label: 'Dashboard', to: '/dashboard' })
  }

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const known = SECTION[segment]

    if (known) {
      // A section is a link only when it isn't the current page and it has a
      // real index route.
      crumbs.push({ label: known.label, to: isLast ? undefined : known.to })
    } else if (looksLikeId(segment)) {
      crumbs.push({ label: `#${segment.slice(0, 8)}` })
    } else {
      crumbs.push({ label: titleCase(segment) })
    }
  })

  return crumbs
}

// --- Entity-aware override (ADM-011) --------------------------------------
// The route-derived trail ends in a short id (#a3f19c8e). A page that knows the
// entity's real name/context calls useSetBreadcrumbs to replace the trail for
// as long as it is mounted (e.g. the case workspace). The provider lives in the
// app shell, above both the Topbar (which renders <Breadcrumbs>) and the routed
// page (which sets the override).
type BreadcrumbsContextValue = {
  override: Crumb[] | null
  setOverride: (items: Crumb[] | null) => void
}

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null)

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Crumb[] | null>(null)
  return (
    <BreadcrumbsContext.Provider value={{ override, setOverride }}>
      {children}
    </BreadcrumbsContext.Provider>
  )
}

/**
 * Sets the breadcrumb trail for the lifetime of the calling page, then restores
 * the route-derived trail on unmount. No-op outside a provider.
 */
export function useSetBreadcrumbs(items: Crumb[]): void {
  const ctx = useContext(BreadcrumbsContext)
  // The serialized key stands in for `items` in the dependency list, so the
  // effect re-runs on content changes but not on a new array identity.
  const key = items.map((crumb) => `${crumb.label}|${crumb.to ?? ''}`).join('>')
  useEffect(() => {
    if (!ctx) return
    ctx.setOverride(items)
    return () => ctx.setOverride(null)
  }, [ctx, key]) // eslint-disable-line react-hooks/exhaustive-deps
}

type BreadcrumbsProps = {
  /** Override the derived trail — e.g. to show an entity's real name. */
  items?: Crumb[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const derived = useBreadcrumbs()
  const override = useContext(BreadcrumbsContext)?.override ?? null
  const crumbs = items ?? override ?? derived

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.to && !isLast ? (
                <Link to={crumb.to} className="crumb-link">
                  {crumb.label}
                </Link>
              ) : (
                <span className="crumb-current" aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
              {!isLast ? <span className="crumb-sep" aria-hidden="true">›</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
