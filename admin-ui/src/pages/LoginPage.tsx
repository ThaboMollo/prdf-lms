import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

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
        <p>No account? <Link to="/register">Register</Link></p>
      </section>
    </main>
  )
}
