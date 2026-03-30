type PaginationControlsProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export function PaginationControls({ page, totalPages, onPageChange, className }: PaginationControlsProps) {
  if (totalPages <= 1) return null

  return (
    <div className={className ?? 'inline-actions'}>
      <button type="button" className="btn btn-secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span className="table-meta">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="btn btn-secondary" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next
      </button>
    </div>
  )
}
