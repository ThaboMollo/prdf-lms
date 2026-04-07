import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCalculator } from '../contexts/CalculatorContext'
import { formatRand } from '../lib/loanCalc'

export function LoginPage() {
  const navigate = useNavigate()
  const { amount, term } = useCalculator()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hasCalcState = amount !== 50000 || term !== 6

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
      return
    }

    navigate('/apply')
  }

  return (
    <div className="split-auth">
      {/* Brand Panel */}
      <div className="auth-brand-panel">
        <div className="brand-logo">PRDF</div>
        <div>
          <h2>Business Finance, Built for Growth</h2>
          <p>Access the capital your business needs — quickly, transparently, and entirely online.</p>
        </div>
        <ul className="auth-brand-bullets">
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Apply in under 10 minutes</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> NCR-compliant lending process</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Dedicated loan officer support</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Funds disbursed within 48 hours</li>
        </ul>
        {hasCalcState && (
          <div className="auth-loan-preview">
            <p>Your selected loan</p>
            <strong>{formatRand(amount)} over {term} month{term !== 1 ? 's' : ''}</strong>
          </div>
        )}
      </div>

      {/* Form Panel */}
      <div className="auth-form-panel">
        <div>
          <h1>Welcome back</h1>
          <p>Sign in to continue your PRDF loan journey.</p>
        </div>
        <form onSubmit={onSubmit} className="form-grid">
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
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>
          <button
            className={`btn btn-primary${loading ? ' btn-loading' : ''}`}
            type="submit"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? '' : 'Sign In'}
          </button>
        </form>
        {error ? <p className="text-error" role="alert">{error}</p> : null}
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          New to PRDF?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Create your account
          </Link>
        </p>
      </div>
    </div>
  )
}
