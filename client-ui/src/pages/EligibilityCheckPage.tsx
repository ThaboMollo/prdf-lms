import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PublicNav } from '../components/shared/PublicNav'

const CRITERIA = {
  impact: {
    label: 'DEVELOPMENTAL IMPACT',
    items: [
      'Applicants who demonstrate expected Developmental Impact',
      'Projects must demonstrate targets for employment creation',
      'Applicants must be willing to participate in developmental programs',
      'Transactions from rural provinces must have rural community participation',
      'Projects must demonstrate sustainability',
      'The business must demonstrate capacity to repay the loan offered',
    ],
  },
  ownership: {
    label: 'OWNERSHIP & CONTROL',
    items: [
      'Enterprises must be >50.1% black women owned',
      'Applicants must be 90% South African nationals with operations controlled by SA citizens',
      'Enterprises must be 100% Director Operational',
      'Applicants must be permanent residents of South Africa',
    ],
  },
  compliance: {
    label: 'REGISTRATION & COMPLIANCE',
    items: [
      'The Enterprise(s) must be compliant with generally accepted corporate governance practices appropriate to the client\'s legal status',
      'The business must be registered with the CIPC',
      'The business must be registered with SARS as a taxpayer and in possession of a valid tax clearance certificate or a tax pin',
      'The members/shareholders of the business must not be unrehabilitated insolvents and not be under debt review or an administration order',
    ],
  },
} as const

type SectionKey = keyof typeof CRITERIA

function getAllItems(): string[] {
  return Object.values(CRITERIA).flatMap((s) => s.items)
}

export function EligibilityCheckPage() {
  const navigate = useNavigate()
  const allItems = getAllItems()
  const [checked, setChecked] = useState<Set<string>>(new Set())

  function toggle(item: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  }

  function handleSubmit() {
    const allChecked = checked.size === allItems.length
    if (allChecked) {
      navigate('/eligibility/result')
    } else {
      navigate('/eligibility/not-eligible')
    }
  }

  const confirmedCount = checked.size
  const totalCount = allItems.length

  return (
    <div className="public-shell">
      <div className="elig-nav-bar">
        <PublicNav session={null} />
      </div>

      <div className="elig-check-layout">
        <aside className="elig-check-sidebar">
          <div className="elig-check-sidebar__top">
            <h1 className="elig-check-sidebar__title">CHECK YOUR ELIGIBILITY</h1>
            <p className="elig-check-sidebar__desc">
              Confirm that your business meets PRDF's eligibility criteria by checking each
              requirement below. All criteria must be met to proceed with a loan application.
            </p>
          </div>

          <div className="elig-check-sidebar__docs">
            <span className="elig-check-sidebar__docs-label">DOCUMENTS YOU'LL NEED</span>
            <ul className="elig-check-sidebar__docs-list">
              <li>Certified ID copy</li>
              <li>CIPC registration</li>
              <li>SARS tax clearance / pin</li>
              <li>3 months bank statements</li>
              <li>Proof of address</li>
              <li>Financial statements</li>
            </ul>
          </div>
        </aside>

        <main className="elig-check-main">
          <div className="elig-check-header">
            <span className="elig-check-header__label">ELIGIBILITY SELF-ASSESSMENT</span>
            <h2 className="elig-check-header__title">CONFIRM YOUR ELIGIBILITY</h2>
            <p className="elig-check-header__desc">
              Check each box to confirm your business meets the requirement. All criteria must be met.
            </p>
          </div>

          <div className="elig-check-card">
            {(Object.keys(CRITERIA) as SectionKey[]).map((key, sectionIdx) => {
              const section = CRITERIA[key]
              return (
                <div key={key}>
                  {sectionIdx > 0 && <hr className="elig-check-divider" />}
                  <div className="elig-check-section">
                    <span className="elig-check-section__label">{section.label}</span>
                    {section.items.map((item) => (
                      <label key={item} className="elig-check-item">
                        <input
                          type="checkbox"
                          checked={checked.has(item)}
                          onChange={() => toggle(item)}
                          className="elig-check-item__input"
                        />
                        <span
                          className={`elig-check-item__box ${checked.has(item) ? 'elig-check-item__box--checked' : ''}`}
                          aria-hidden="true"
                        >
                          {checked.has(item) && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        <span className="elig-check-item__label">{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="elig-check-footer">
            <div className="elig-check-footer__progress">
              <span className="elig-check-footer__count">{confirmedCount}</span>
              <span className="elig-check-footer__total">of {totalCount} criteria confirmed</span>
            </div>
            <button
              type="button"
              className="btn btn-primary elig-check-footer__submit"
              onClick={handleSubmit}
            >
              Check My Eligibility →
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
