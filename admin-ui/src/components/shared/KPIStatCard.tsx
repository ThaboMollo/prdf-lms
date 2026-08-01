import { Link } from 'react-router-dom'

type KPIStatCardProps = {
  label: string
  value: string | number
  trend?: string
  variant?: 'warning' | 'danger'
  /** When set, the whole card becomes a link to this route (a drill-down). */
  to?: string
}

export function KPIStatCard({ label, value, trend, variant, to }: KPIStatCardProps) {
  const variantClass = variant === 'danger' ? ' kpi-card--danger' : variant === 'warning' ? ' kpi-card--warning' : ''

  const body = (
    <>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {trend ? <p className="kpi-trend">{trend}</p> : null}
      {to ? <span className="kpi-arrow" aria-hidden="true">→</span> : null}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={`kpi-card kpi-card--link${variantClass}`}>
        {body}
      </Link>
    )
  }

  return <article className={`kpi-card${variantClass}`}>{body}</article>
}
