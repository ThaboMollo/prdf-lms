import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate, Link } from 'react-router-dom'
import { LoanCalculator } from '../components/shared/LoanCalculator'
import { PublicNav } from '../components/shared/PublicNav'
import { LOAN_AMOUNT_RANGE_LABEL } from '../lib/loanLimits'

type LandingPageProps = {
  session: Session | null
}

const QUALIFY_CRITERIA = [
  'Applicants who demonstrate expected Developmental Impact',
  'Projects must demonstrate targets for employment creation',
  'Enterprises must be >50.1% black women owned',
  'Applicants must be 90% South African nationals with operations controlled by SA citizens',
  'Enterprises must be 100% Director Operational',
  'Applicants must be willing to participate in developmental programs',
  'Transactions from rural provinces must have rural community participation',
  'Projects must demonstrate sustainability',
  'Applicants must be permanent residents of South Africa',
  'The Enterprise(s) must be compliant with generally accepted corporate governance practices appropriate to the client\'s legal status',
  'The business must demonstrate capacity to repay the loan offered',
  'The business must be registered with the CIPC',
  'The business must be registered with SARS as a taxpayer and in possession of a valid tax clearance certificate or a tax pin',
  'The members/shareholders of the business must not be unrehabilitated insolvents and not be under debt review or an administration order',
]
const QUALIFY_CRITERIA_COLUMNS = [
  QUALIFY_CRITERIA.slice(0, 7),
  QUALIFY_CRITERIA.slice(7),
]

const STEPS = [
  { num: '1', title: 'Check Eligibility', desc: 'Review the criteria and confirm your business qualifies' },
  { num: '2', title: 'Complete Application', desc: 'Fill in your business details, financials, and loan requirements' },
  { num: '3', title: 'Upload Documents', desc: 'Submit required documents like ID, CIPC registration, and tax clearance' },
  { num: '4', title: 'Get Funded', desc: 'Receive a decision within 5 working days and get disbursed' },
]

const SUPPORT_CARDS = [
  { title: 'Business Health Assessment', desc: 'Evaluate your business readiness with our diagnostic tool' },
  { title: 'Compliance Support', desc: 'Get help with CIPC, SARS registration, and corporate governance' },
  { title: 'Business Skills Training', desc: 'Access business plan writing and general management training' },
  { title: 'Funding Readiness Webinars', desc: 'Monthly online sessions to prepare for your loan application' },
  { title: 'Marketing & Branding', desc: 'Connect with partners for marketing collateral and brand development' },
  { title: 'SARS Support', desc: 'Assistance with tax returns, VAT registration, and tax clearance' },
]

const DOCUMENTS = [
  { title: 'ID Document', desc: 'Director identity document (certified copy)' },
  { title: 'Proof of Address', desc: 'Recent utility bill or bank statement' },
  { title: 'Bank Statements', desc: 'Last 3 months of business bank statements' },
  { title: 'CIPC Registration', desc: 'Company registration certificate from CIPC' },
  { title: 'Tax Clearance', desc: 'Valid SARS tax clearance certificate or tax pin' },
  { title: 'Financial Statements', desc: 'Latest annual financials or management accounts' },
]

export function LandingPage({ session }: LandingPageProps) {
  const navigate = useNavigate()

  return (
    <div className="public-shell landing-design-page">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* ── Hero ── */}
      <div className="landing-gradient-hero">
        <PublicNav session={session} />
        <main className="landing-main" id="main-content">
          <section className="landing-hero">
            <div className="landing-copy-panel">
              <p className="eyebrow">Developmental Finance</p>
              <h1 className="hero-headline">
                EMPOWERING SOUTH AFRICAN BUSINESSES TO <span>GROW</span>
              </h1>
              <p className="hero-desc">
                PRDF provides affordable loan financing for qualifying
                small and medium enterprises across South Africa.
              </p>
              <p className="landing-hero-note">{LOAN_AMOUNT_RANGE_LABEL}.</p>
              <div className="landing-hero-actions">
                <button className="btn btn-primary landing-primary-action" type="button" onClick={() => navigate('/register')}>
                  Apply Now
                </button>
                <button className="btn btn-ghost landing-secondary-action" type="button" onClick={() => navigate('/eligibility')}>
                  Check Eligibility
                </button>
              </div>
              <p className="landing-hero-note">No obligation &middot; Takes about 5 minutes</p>
            </div>
            <LoanCalculator showApplyButton={true} applyLabel="Apply Now" />
          </section>
        </main>
      </div>

      <LandingSectionNav />

      {/* ── About Section ── */}
      <section id="about" className="landing-section landing-section--white landing-section--centered" aria-label="About PRDF">
        <span className="landing-section__eyebrow">WHO WE ARE</span>
        <h2 className="landing-section__heading">ABOUT PRDF</h2>
        <p className="landing-section__body landing-section__body--narrow">
          The People's Republic Development Fund is a developmental finance institution established
          to support small and medium enterprises with affordable, accessible financing. We bridge
          the funding gap for businesses that contribute to economic growth and job creation in
          South Africa.
        </p>
        <div className="landing-stats-row">
          <div className="landing-stat">
            <span className="landing-stat__value">R500M+</span>
            <span className="landing-stat__label">DISBURSED</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat__value">2,500+</span>
            <span className="landing-stat__label">BUSINESSES FUNDED</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat__value">15,000+</span>
            <span className="landing-stat__label">JOBS CREATED</span>
          </div>
        </div>
        <p className="landing-stats-note">Cumulative impact since inception across South Africa.</p>
      </section>

      {/* ── Eligibility Section ── */}
      <section id="eligibility" className="landing-section landing-section--dark" aria-label="Eligibility criteria">
        <span className="landing-section__eyebrow landing-section__eyebrow--accent">ELIGIBILITY CRITERIA</span>
        <h2 className="landing-section__heading landing-section__heading--white">DO YOU QUALIFY?</h2>
        <p className="landing-section__body landing-section__body--white-muted" style={{ maxWidth: 720 }}>
          PRDF funding is available to South African-registered businesses that meet the following
          criteria. Review the requirements below to determine if your business qualifies.
        </p>

        <div className="landing-elig-columns">
          {QUALIFY_CRITERIA_COLUMNS.map((criteria, index) => (
            <div key={index} className="landing-elig-col">
              <h3 className="landing-elig-col__title">{index === 0 ? 'CORE REQUIREMENTS' : 'COMPLIANCE REQUIREMENTS'}</h3>
              {criteria.map((c) => (
                <div key={c} className="landing-elig-item">
                  <svg aria-hidden="true" focusable="false" className="landing-elig-item__icon landing-elig-item__icon--check" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span><span className="sr-only">Requirement: </span>{c}</span>
                </div>
              ))}
              </div>
          ))}
        </div>

        <div className="landing-elig-cta">
          <p>Not sure if you qualify? Use our free eligibility checker to find out in under 2 minutes.</p>
          <Link to="/eligibility" className="btn btn-secondary">
            Check Eligibility
          </Link>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="landing-section landing-section--white landing-section--centered" aria-label="How it works">
        <span className="landing-section__eyebrow">HOW IT WORKS</span>
        <h2 className="landing-section__heading">YOUR PATH TO FUNDING</h2>

        <div className="landing-steps-row">
          {STEPS.map((step, i) => (
            <div key={step.num} className="landing-step">
              <div className="landing-step__circle-row">
                <div className="landing-step__circle">{step.num}</div>
                {i < STEPS.length - 1 && <div className="landing-step__line" />}
              </div>
              <h3 className="landing-step__title">{step.title}</h3>
              <p className="landing-step__desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Non-Financial Support ── */}
      <section id="support" className="landing-section landing-section--light" aria-label="Non-financial support">
        <span className="landing-section__eyebrow">BEYOND FUNDING</span>
        <h2 className="landing-section__heading">NON-FINANCIAL SUPPORT SERVICES</h2>
        <p className="landing-section__body">
          PRDF offers more than capital. We help your business become funding-ready and sustainable.
        </p>

        <div className="landing-cards-grid">
          {SUPPORT_CARDS.map((card) => (
            <div key={card.title} className="landing-support-card">
              <h3 className="landing-support-card__title">{card.title}</h3>
              <p className="landing-support-card__desc">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Required Documents ── */}
      <section id="documents" className="landing-section landing-section--white landing-section--centered" aria-label="Required documents">
        <span className="landing-section__eyebrow">PREPARE YOUR APPLICATION</span>
        <h2 className="landing-section__heading">DOCUMENTS YOU WILL NEED</h2>
        <p className="landing-section__body landing-section__body--narrow">
          Gather these documents before starting your application to ensure a smooth process.
        </p>

        <div className="landing-cards-grid">
          {DOCUMENTS.map((doc) => (
            <div key={doc.title} className="landing-doc-card">
              <div className="landing-doc-card__icon">
                <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="landing-doc-card__text">
                <h3 className="landing-doc-card__title">{doc.title}</h3>
                <p className="landing-doc-card__desc">{doc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Footer ── */}
      <section className="landing-section landing-section--dark landing-section--centered landing-cta-footer" aria-label="Call to action">
        <h2 className="landing-section__heading landing-section__heading--white landing-cta-footer__heading">
          READY TO GROW YOUR BUSINESS?
        </h2>
        <p className="landing-section__body landing-section__body--white-muted">
          Check your eligibility, prepare your documents, and apply in under 10 minutes.
        </p>
        <div className="landing-cta-footer__actions">
          <button type="button" className="btn btn-primary landing-cta-footer__btn" onClick={() => navigate('/register')} style={{ background: 'var(--brand-accent)' }}>
            Apply Now
          </button>
        </div>
        <p className="landing-cta-footer__secondary">
          Not sure yet? <Link to="/eligibility">Check your eligibility first</Link>.
        </p>
        <p className="landing-cta-footer__note">
          NCR Registered &nbsp;|&nbsp; Funds within 5 working days &nbsp;|&nbsp; 100% Online
        </p>
      </section>

      <BackToTop />
    </div>
  )
}

const SECTION_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#eligibility', label: 'Eligibility' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#support', label: 'Support' },
  { href: '#documents', label: 'Documents' },
]

function LandingSectionNav() {
  return (
    <nav className="landing-section-nav" aria-label="Page sections">
      <ul>
        {SECTION_LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className="landing-back-to-top"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}
