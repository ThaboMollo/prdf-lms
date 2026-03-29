import { Link } from 'react-router-dom'

type EmptyStateProps = {
  title: string
  message: string
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
}

export function EmptyState({ title, message, ctaLabel, ctaHref, onCtaClick }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-live="polite">
      <h3>{title}</h3>
      <p>{message}</p>
      {ctaLabel && ctaHref ? <Link className="btn" to={ctaHref}>{ctaLabel}</Link> : null}
      {ctaLabel && onCtaClick ? (
        <button className="btn" type="button" onClick={onCtaClick}>
          {ctaLabel}
        </button>
      ) : null}
    </section>
  )
}
