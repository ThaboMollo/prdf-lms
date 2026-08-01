import type { LoanApplicationStatus } from '../../lib/api'

type StepState = 'done' | 'current' | 'future' | 'rejected'
export type LifecycleStep = { label: string; state: StepState; annotation?: string }

// The happy-path rail (spec §4.3). The nine-value status enum
// (packages/domain/status.ts) collapses onto these seven stages; the two
// exceptions — InfoRequested and Rejected — are handled below rather than
// given their own bead, because neither is a forward step.
const HAPPY_PATH = ['Draft', 'Submitted', 'Review', 'Approved', 'Disbursed', 'Repaying', 'Closed'] as const

// Where each status sits on the rail. Rejected leaves the path entirely, so it
// is handled separately and intentionally absent here.
const STATUS_STAGE: Record<Exclude<LoanApplicationStatus, 'Rejected'>, number> = {
  Draft: 0,
  Submitted: 1,
  UnderReview: 2,
  InfoRequested: 2, // sits on Review, annotated as awaiting the client
  Approved: 3,
  Disbursed: 4,
  InRepayment: 5,
  Closed: 6
}

/**
 * Pure mapping from a status to the rail's rendered steps. Exported so the
 * enum→rail contract can be checked directly. For every non-Rejected status the
 * reached stage is `current` and all prior stages are `done`; Rejected returns a
 * short rail ending in a red terminal bead.
 */
export function computeLifecycle(status: LoanApplicationStatus): LifecycleStep[] {
  if (status === 'Rejected') {
    return [
      { label: 'Draft', state: 'done' },
      { label: 'Submitted', state: 'done' },
      { label: 'Review', state: 'done' },
      { label: 'Rejected', state: 'rejected' }
    ]
  }

  const current = STATUS_STAGE[status]
  return HAPPY_PATH.map((label, index) => ({
    label,
    state: index < current ? 'done' : index === current ? 'current' : 'future',
    annotation: index === current && status === 'InfoRequested' ? 'Info requested' : undefined
  }))
}

function beadMark(state: StepState, index: number): string {
  if (state === 'done') return '✓'
  if (state === 'rejected') return '✕'
  return String(index + 1)
}

type LifecycleRailProps = { status: LoanApplicationStatus }

export function LifecycleRail({ status }: LifecycleRailProps) {
  const steps = computeLifecycle(status)

  return (
    <nav className="lifecycle" aria-label="Application lifecycle">
      <ol className="lifecycle-track">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={`lc-step is-${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="lc-bead" aria-hidden="true">{beadMark(step.state, index)}</span>
            <span className="lc-label">{step.label}</span>
            {step.annotation ? <span className="lc-annotation">{step.annotation}</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}
