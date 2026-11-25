import type { LoanApplicationStatus } from './api'

// Display names for application stages, per the PRDF Admin Corrections V3
// (28-10-2026). Display only: the status enum the API and database speak is
// unchanged. BoardApproved is the "Finance" row of the client's stage table —
// term sheets are drawn up after Board sign-off and handed to Legal.
const STAGE_LABELS: Partial<Record<LoanApplicationStatus, string>> = {
  DueDiligence: 'Due Diligence',
  InfoRequested: 'Info Requested',
  BoardApproved: 'Financing stage',
  Contracting: 'Contracting stage',
  Disbursed: 'Disbursements',
  InRepayment: 'Post investment'
}

/** The name staff see for an application stage. */
export function stageLabel(status: LoanApplicationStatus | string): string {
  return STAGE_LABELS[status as LoanApplicationStatus] ?? status.replace(/([a-z])([A-Z])/g, '$1 $2')
}
