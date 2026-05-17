import type { Session } from '@supabase/supabase-js'
import { LoanCalculator } from '../components/shared/LoanCalculator'
import { PublicNav } from '../components/shared/PublicNav'

type LandingPageProps = {
  session: Session | null
}

export function LandingPage({ session }: LandingPageProps) {
  return (
    <div className="public-shell">
      <div className="landing-gradient-hero">
        <PublicNav session={session} />

        <main className="landing-main">
          <section className="landing-hero">
            {/* Left: Copy */}
            <div>
              <p className="eyebrow">Business Finance</p>
              <h1 className="hero-headline">
                The capital your business needs,{' '}
                <span>fast</span>.
              </h1>
              <p className="hero-desc">
                Apply in minutes. No branch visits. No paperwork. Get funded within 48 hours
                with full transparency on every fee before you commit.
              </p>
              <div className="trust-strip">
                <span className="trust-pill">
                  <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                  NCR Registered
                </span>
                <span className="trust-pill">
                  <i className="fa-solid fa-bolt" aria-hidden="true" />
                  Funds within 48hrs
                </span>
                <span className="trust-pill">
                  <i className="fa-solid fa-lock" aria-hidden="true" />
                  100% Secure &amp; Online
                </span>
              </div>
            </div>

            {/* Right: Calculator */}
            <LoanCalculator showApplyButton={true} applyLabel="Apply Now — It's Free" />
          </section>
        </main>
      </div>

      {/* Trust cards */}
      <section className="trust-section" aria-label="Why choose PRDF">
        <div className="trust-card">
          <i className="fa-solid fa-bolt trust-card-icon" aria-hidden="true" />
          <h3>Fast Approval</h3>
          <p>Complete your application in under 10 minutes. Our team reviews within 24 hours.</p>
        </div>
        <div className="trust-card">
          <i className="fa-solid fa-scale-balanced trust-card-icon" aria-hidden="true" />
          <h3>Full Transparency</h3>
          <p>See exactly what you'll pay — monthly instalments, total fees, and repayment date — before you sign.</p>
        </div>
        <div className="trust-card">
          <i className="fa-solid fa-building trust-card-icon" aria-hidden="true" />
          <h3>Built for Business</h3>
          <p>Working capital, equipment, expansion — we fund the growth ambitions of South African businesses.</p>
        </div>
      </section>
    </div>
  )
}
