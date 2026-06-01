import { Link } from 'react-router-dom'
import { PublicNav } from '../components/shared/PublicNav'

export function NotEligiblePage() {
  return (
    <div className="public-shell">
      <div className="elig-nav-bar">
        <PublicNav session={null} />
      </div>

      <main className="elig-result">
        <div className="elig-result__icon elig-result__icon--warning">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 className="elig-result__heading">YOU DO NOT CURRENTLY QUALIFY</h1>
        <p className="elig-result__subtitle">
          Based on your responses, your business does not currently meet all the eligibility
          requirements for PRDF loan financing. But don't worry — there are steps you can take
          to become eligible.
        </p>

        <div className="elig-result__card">
          <span className="elig-result__card-label">WHAT YOU CAN DO</span>

          <div className="elig-not-eligible__action-item">
            <svg className="elig-not-eligible__check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Complete your CIPC registration and ensure compliance</span>
          </div>
          <div className="elig-not-eligible__action-item">
            <svg className="elig-not-eligible__check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Obtain a valid SARS tax clearance certificate or tax pin</span>
          </div>
          <div className="elig-not-eligible__action-item">
            <svg className="elig-not-eligible__check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Get professional assistance with business compliance and readiness</span>
          </div>

          <hr className="elig-result__divider" />

          <span className="elig-result__card-label">RECOMMENDED PARTNER</span>
          <div className="elig-not-eligible__partner">
            <div className="elig-not-eligible__partner-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01" /><path d="M16 6h.01" />
                <path d="M12 6h.01" /><path d="M12 10h.01" />
                <path d="M12 14h.01" /><path d="M16 10h.01" />
                <path d="M16 14h.01" /><path d="M8 10h.01" />
                <path d="M8 14h.01" />
              </svg>
            </div>
            <div className="elig-not-eligible__partner-info">
              <strong>Phahla Consultants</strong>
              <p>Expert business compliance, CIPC registration, SARS support, and funding readiness services.</p>
              <a href="https://phahlaconsulting.co.za/" target="_blank" rel="noopener noreferrer">
                phahlaconsulting.co.za
              </a>
            </div>
          </div>
        </div>

        <div className="elig-result__actions">
          <a
            href="https://phahlaconsulting.co.za/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary elig-result__btn"
          >
            Visit Phahla Consultants
          </a>
          <Link to="/eligibility" className="btn btn-ghost elig-result__btn">
            Retake Assessment
          </Link>
        </div>

        <p className="elig-result__fine-print">
          You can retake the eligibility assessment at any time once your business meets the requirements.
        </p>
      </main>
    </div>
  )
}
