import { Link } from 'react-router-dom'
import { PublicNav } from '../components/shared/PublicNav'

export function EligibilityResultPage() {
  return (
    <div className="public-shell">
      <div className="elig-nav-bar">
        <PublicNav session={null} />
      </div>

      <main className="elig-result">
        <div className="elig-result__icon elig-result__icon--success">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 className="elig-result__heading">YOU QUALIFY FOR PRDF FUNDING</h1>
        <p className="elig-result__subtitle">
          Based on your responses, your business meets the basic eligibility requirements
          for PRDF loan financing.
        </p>

        <div className="elig-result__card">
          <span className="elig-result__card-label">YOUR ELIGIBILITY SUMMARY</span>

          <div className="elig-result__row">
            <span className="elig-result__row-label">Ownership Criteria</span>
            <span className="elig-result__row-value">Met</span>
          </div>
          <div className="elig-result__row">
            <span className="elig-result__row-label">Compliance Requirements</span>
            <span className="elig-result__row-value">Met</span>
          </div>
          <div className="elig-result__row">
            <span className="elig-result__row-label">Business Viability</span>
            <span className="elig-result__row-value">Met</span>
          </div>

          <hr className="elig-result__divider" />

          <div className="elig-result__row">
            <span className="elig-result__row-label" style={{ fontWeight: 700 }}>Eligibility Status</span>
            <span className="elig-result__badge elig-result__badge--success">ELIGIBLE</span>
          </div>
        </div>

        <div className="elig-result__actions">
          <Link to="/register" className="btn btn-primary elig-result__btn">
            Create Account &amp; Apply
          </Link>
          <Link to="/" className="btn btn-ghost elig-result__btn">
            Back to Home
          </Link>
        </div>

        <p className="elig-result__fine-print">
          This is a preliminary assessment. Final approval is subject to document verification and credit checks.
        </p>
      </main>
    </div>
  )
}
