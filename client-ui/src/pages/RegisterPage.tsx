import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCalculator } from '../contexts/CalculatorContext'
import { formatRand } from '../lib/loanCalc'

export function RegisterPage() {
  const navigate = useNavigate()
  const { amount, term } = useCalculator()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hasCalcState = amount !== 50000 || term !== 6

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          phone_number: phoneNumber.trim()
        }
      }
    })
    setLoading(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }

    navigate('/apply')
  }

  return (
    <div className="split-auth">
      {/* Brand Panel */}
      <div className="auth-brand-panel">
        <Link to="/" className="brand-logo" aria-label="PRDF home">
          <img src="/prdf-logo.png" alt="" className="brand-logo__mark" />
          <span>PRDF</span>
        </Link>
        <div>
          <h2>Start your business loan application today</h2>
          <p>Join hundreds of South African businesses that have grown with PRDF funding.</p>
        </div>
        <ul className="auth-brand-bullets">
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> 100% online — no branch visits</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Loans from R10,000 to R10 million</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Repayment terms up to 60 months</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> NCR-registered and fully compliant</li>
        </ul>
        {hasCalcState && (
          <div className="auth-loan-preview">
            <p>You're applying for</p>
            <strong>{formatRand(amount)} over {term} month{term !== 1 ? 's' : ''}</strong>
          </div>
        )}
      </div>

      {/* Form Panel */}
      <div className="auth-form-panel">
        <div>
          <h1>Create your account</h1>
          <p>It takes less than 2 minutes to get started.</p>
        </div>
        <form onSubmit={onSubmit} className="stack-sm">
          <div className="form-two-col">
            <label className="form-field">
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
                placeholder="Thabo"
              />
            </label>
            <label className="form-field">
              Last name
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
                placeholder="Mponya"
              />
            </label>
          </div>
          <label className="form-field">
            Phone number
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              autoComplete="tel"
              placeholder="+27 81 234 5678"
            />
          </label>
          <label className="form-field">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@business.co.za"
            />
          </label>
          <label className="form-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
            />
          </label>
          <button
            className={`btn btn-primary${loading ? ' btn-loading' : ''}`}
            type="submit"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? '' : 'Create Account & Apply'}
          </button>
        </form>
        {error ? <p className="text-error" role="alert">{error}</p> : null}
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Already registered?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
