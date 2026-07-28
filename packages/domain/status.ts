// Single source of truth for the loan application status vocabulary and its
// transition graph, shared by client-ui and admin-ui. backend-node keeps its
// own copy (see package.json header) — this and that copy must be kept in
// sync by hand; the DB trigger (infra/supabase/migrations/20260724180000_
// status_transition_trigger.sql) is the actual enforcement backstop either
// way.
//
// Previously drifted: client-ui's local copy of this type included a
// 'Withdrawn' value that was never reachable anywhere (not in the DB, not
// in backend-node's transition graph) — traced to a single dead, unrouted
// page. This type matches what's actually real.
export type LoanApplicationStatus =
  | 'Draft'
  | 'Submitted'
  | 'UnderReview'
  | 'InfoRequested'
  | 'Approved'
  | 'Rejected'
  | 'Disbursed'
  | 'InRepayment'
  | 'Closed'

export const LOAN_STATUS_TRANSITIONS: Partial<Record<LoanApplicationStatus, LoanApplicationStatus[]>> = {
  Draft: ['Submitted'],
  Submitted: ['UnderReview', 'InfoRequested', 'Approved', 'Rejected'],
  UnderReview: ['InfoRequested', 'Approved', 'Rejected'],
  InfoRequested: ['Submitted', 'UnderReview'],
  Approved: ['Disbursed'],
  Disbursed: ['InRepayment'],
  InRepayment: ['Closed'],
}

export function allowedNextStatuses(current: LoanApplicationStatus): LoanApplicationStatus[] {
  return LOAN_STATUS_TRANSITIONS[current] ?? []
}

export function isValidTransition(from: LoanApplicationStatus, to: LoanApplicationStatus): boolean {
  return from === to || allowedNextStatuses(from).includes(to)
}
