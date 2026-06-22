type KPIStatCardProps = {
  label: string
  value: string | number
  trend?: string
  variant?: 'warning' | 'danger'
}

export function KPIStatCard({ label, value, trend, variant }: KPIStatCardProps) {
  const variantClass = variant === 'danger' ? ' kpi-card--danger' : variant === 'warning' ? ' kpi-card--warning' : ''
  return (
    <article className={`kpi-card${variantClass}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {trend ? <p className="kpi-trend">{trend}</p> : null}
    </article>
  )
}
