import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      setError(signUpError.message)
      return
    }

    navigate('/dashboard')
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Create Account</h1>
        <p>Register to access PRDF loan management workflows.</p>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn" type="submit">Create Account</button>
        </form>
        {error ? <p className="text-error">{error}</p> : null}
        <p>Already have an account? <Link to="/login">Login</Link></p>
      </section>
    </main>
  )
}
