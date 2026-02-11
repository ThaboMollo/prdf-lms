type KPIStatCardProps = {
  label: string
  value: string | number
  trend?: string
}

export function KPIStatCard({ label, value, trend }: KPIStatCardProps) {
  return (
    <article className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {trend ? <p className="kpi-trend">{trend}</p> : null}
    </article>
  )
}
