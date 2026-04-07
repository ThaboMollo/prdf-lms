type WizardProgressProps = {
  steps: string[]
  currentStep: number // 1-indexed
}

export function WizardProgress({ steps, currentStep }: WizardProgressProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }} role="list" aria-label="Application steps">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const isDone = stepNumber < currentStep
        const isActive = stepNumber === currentStep
        const isLast = index === steps.length - 1

        return (
          <div
            key={label}
            role="listitem"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}
          >
            {/* Row: connector — dot — connector */}
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  background: isDone || isActive ? 'var(--brand)' : 'var(--border-light)',
                  opacity: index === 0 ? 0 : 1,
                }}
              />
              <div
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'wizard-step-dot',
                  isDone ? 'wizard-step-dot--done' : '',
                  isActive ? 'wizard-step-dot--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isDone
                  ? <i className="fa-solid fa-check" aria-hidden="true" style={{ fontSize: '0.75rem' }} />
                  : stepNumber}
              </div>
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  background: isDone ? 'var(--brand)' : 'var(--border-light)',
                  opacity: isLast ? 0 : 1,
                }}
              />
            </div>

            {/* Label below */}
            <span
              className={[
                'wizard-step-label',
                isDone ? 'wizard-step-label--done' : '',
                isActive ? 'wizard-step-label--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ marginTop: '0.4rem', paddingInline: '4px' }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
