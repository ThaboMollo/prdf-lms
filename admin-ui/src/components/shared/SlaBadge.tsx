import type { LoanApplicationStatus } from '../../lib/api'
import { calculateDaysElapsed } from '../../lib/format'

// Only applications that are actively awaiting an internal decision carry an
// SLA clock. Extracted from ApplicationsPage so Dashboard, Pipeline and the
// Case workspace all render the same badge (spec §5.3).
const SLA_STATUSES: LoanApplicationStatus[] = ['Submitted', 'UnderReview', 'InfoRequested']

type SlaBadgeProps = {
  status: LoanApplicationStatus
  submittedAt: string | null
}

export function SlaBadge({ status, submittedAt }: SlaBadgeProps) {
  if (!submittedAt) return null
  if (!SLA_STATUSES.includes(status)) return null

  const days = calculateDaysElapsed(submittedAt)

  if (days >= 5) {
    return <span className="sla-badge sla-badge--breach">SLA breached · {days}d</span>
  }
  if (days === 4) {
    return <span className="sla-badge sla-badge--warn">SLA warning · 4d</span>
  }
  return null
}
