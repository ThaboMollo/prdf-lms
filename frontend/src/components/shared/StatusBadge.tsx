import type { LoanApplicationStatus } from '../../lib/api'

type StatusBadgeProps = {
  status: LoanApplicationStatus | string
}

function toStatusClass(status: string): string {
  if (status === 'Approved' || status === 'Verified' || status === 'Completed') return 'status-ok'
  if (status === 'Rejected' || status === 'Closed') return 'status-bad'
  if (status === 'InfoRequested') return 'status-alert'
  return 'status-neutral'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${toStatusClass(status)}`}>{status}</span>
}
