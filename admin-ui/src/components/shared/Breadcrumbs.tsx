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

type BreadcrumbsProps = {
  /** Override the derived trail — e.g. to show an entity's real name. */
  items?: Crumb[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const derived = useBreadcrumbs()
  const crumbs = items ?? derived

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
