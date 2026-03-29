import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function RegisterPage() {
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

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
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            Phone number
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
          </label>
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
