import type { LoanApplicationStatus } from '../../lib/api'

type StatusBadgeProps = {
  status: LoanApplicationStatus | string
}

function toStatusClass(status: string): string {
  if (status === 'Approved' || status === 'BoardApproved' || status === 'Verified' || status === 'Completed') return 'status-ok'
  if (status === 'Rejected' || status === 'Closed') return 'status-bad'
  if (status === 'InfoRequested') return 'status-alert'
  return 'status-neutral'
}

// Camel-cased statuses (BoardApproved, DueDiligence, InRepayment…) read better
// with spaces before each capital.
function toLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${toStatusClass(status)}`}>{toLabel(status)}</span>
}
