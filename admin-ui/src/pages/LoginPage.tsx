import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      return
    }

    navigate('/dashboard')
  }

  async function onForgotPassword() {
    if (!email) {
      setError('Enter your email address above first.')
      return
    }
    setResetting(true)
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    setResetting(false)
    if (resetError) {
      setError(resetError.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Welcome Back</h1>
        <p>Sign in to continue managing applications and loans.</p>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn" type="submit">Sign In</button>
        </form>
        {error ? <p className="text-error">{error}</p> : null}
        {resetSent ? <p style={{ color: 'var(--success)' }}>Password reset email sent. Check your inbox.</p> : null}
        <p>
          <button type="button" className="link-btn" onClick={onForgotPassword} disabled={resetting}>
            {resetting ? 'Sending...' : 'Forgot password?'}
          </button>
        </p>
        <p>No account? <Link to="/register">Register</Link></p>
      </section>
    </main>
  )
}
