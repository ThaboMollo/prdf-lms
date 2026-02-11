function SkeletonBlock({ height = 16 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden="true" />
}

export function CardSkeleton() {
  return (
    <div className="card">
      <SkeletonBlock height={18} />
      <SkeletonBlock />
      <SkeletonBlock />
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBlock key={index} height={14} />
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="grid-two">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  )
}
