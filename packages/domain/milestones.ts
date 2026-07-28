// Loan milestone tracker — the borrower-facing progress-timeline data,
// derived from the same status vocabulary as status.ts but a distinct
// concept (a fixed set of user-facing checkpoints vs. the full transition
// graph). Currently client-ui-only (StatusPage.tsx); lives in domain rather
// than client-core because it's framework-free and mirrors status.ts's
// existing precedent.
export type Milestone = {
  key: string
  label: string
  description: string
  statuses: string[]
}

export const MILESTONES: Milestone[] = [
  {
    key: 'Submitted',
    label: 'Application Submitted',
    description: 'Your application has been received and is awaiting assignment.',
    statuses: ['Submitted'],
  },
  {
    key: 'UnderReview',
    label: 'Under Review',
    description: 'Our team is reviewing your application and documents.',
    statuses: ['UnderReview', 'InfoRequested'],
  },
  {
    key: 'Approved',
    label: 'Approved',
    description: 'Your loan application has been approved.',
    statuses: ['Approved'],
  },
  {
    key: 'Disbursed',
    label: 'Funds Disbursed',
    description: 'Loan funds have been transferred to your business account.',
    statuses: ['Disbursed'],
  },
  {
    key: 'InRepayment',
    label: 'In Repayment',
    description: 'Your loan is active. Monthly instalments are being collected.',
    statuses: ['InRepayment'],
  },
  {
    key: 'Closed',
    label: 'Loan Closed',
    description: 'This loan has been fully repaid and closed.',
    statuses: ['Closed'],
  },
]

export const STATUS_ORDER = [
  'Draft', 'Submitted', 'UnderReview', 'InfoRequested',
  'Approved', 'Disbursed', 'InRepayment', 'Closed',
]

export const REPAYMENT_STATUSES = new Set(['Disbursed', 'InRepayment', 'Closed'])

export function getMilestoneState(milestone: Milestone, appStatus: string): 'done' | 'active' | 'pending' {
  const normalizedStatus = appStatus === 'InfoRequested' ? 'UnderReview' : appStatus

  if (milestone.statuses.includes(appStatus)) return 'active'

  const milestoneStatusIndex = STATUS_ORDER.indexOf(milestone.statuses[0])
  const currentStatusIndex = STATUS_ORDER.indexOf(normalizedStatus)

  if (milestoneStatusIndex < currentStatusIndex) return 'done'
  return 'pending'
}
