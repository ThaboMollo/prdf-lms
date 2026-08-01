import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export type EntityType = 'application' | 'loan' | 'client'

/**
 * Canonical route for an entity. Kept in one place so ids link consistently as
 * pages migrate onto the redesign (spec §6). `loan` still points at
 * /loan/:id, which ADM-041 redirects to the case Money tab.
 */
export function entityPath(type: EntityType, id: string): string {
  switch (type) {
    case 'application':
      return `/case/${id}`
    case 'loan':
      return `/loan/${id}`
    case 'client':
      return `/pipeline?client=${encodeURIComponent(id)}`
  }
}

function shortId(id: string): string {
  return `#${id.slice(0, 8)}`
}

type EntityLinkProps = {
  type: EntityType
  id: string
  /** Custom label (e.g. a business name). Defaults to a short mono id. */
  children?: ReactNode
  className?: string
}

/**
 * Renders an entity id as a link to its canonical screen — so loan /
 * application / client references are never dead plain text.
 */
export function EntityLink({ type, id, children, className }: EntityLinkProps) {
  return (
    <Link to={entityPath(type, id)} className={`entity-link${className ? ` ${className}` : ''}`}>
      {children ?? <span className="entity-id">{shortId(id)}</span>}
    </Link>
  )
}
