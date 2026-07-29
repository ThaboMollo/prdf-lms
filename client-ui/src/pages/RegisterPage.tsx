import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCalculator } from '../contexts/CalculatorContext'
import { formatRand } from '../lib/loanCalc'
import { useActiveLoanProduct } from '../../../packages/client-core/useLoanProduct'
import { activeTenant } from '../../../packages/tenant-config'
import { FieldError, fieldErrorAttrs, focusFirstInvalidField, type FieldErrorMap } from '../components/shared/FieldError'

type RegisterField = 'firstName' | 'lastName' | 'phoneNumber' | 'email' | 'password'

/**
 * Attribute a Supabase Auth error to the input that caused it.
 *
 * Supabase returns prose, not a field name, so this is the one place in the app
 * where matching on English is unavoidable — signUp is not our API and has no
 * structured `errors` array to read (unlike everything behind lib/api.ts, which
 * goes through ApiError). Anything unmatched falls through to the banner rather
 * than being guessed onto a field, so a wording change upstream degrades to the
 * old behaviour instead of pointing at the wrong input.
 */
function attributeSignUpError(message: string): { field: RegisterField; message: string } | null {
  const text = message.toLowerCase()

  if (text.includes('password')) return { field: 'password', message }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return { field: 'email', message: 'An account with this email already exists. Try signing in instead.' }
  }
  if (text.includes('email')) return { field: 'email', message }
  if (text.includes('phone')) return { field: 'phoneNumber', message }

  return null
}

/**
 * Client-side checks, run before the network call so obvious mistakes are
 * caught without a round trip. Deliberately weaker than the server's rules —
 * this is a convenience, not the control.
 */
function validateRegistration(values: Record<RegisterField, string>): FieldErrorMap {
  const errors: FieldErrorMap = {}

  if (!values.firstName.trim()) errors.firstName = 'Enter your first name.'
  if (!values.lastName.trim()) errors.lastName = 'Enter your last name.'

  const phone = values.phoneNumber.replace(/[\s-]/g, '')
  if (!phone) {
    errors.phoneNumber = 'Enter your phone number.'
  } else if (!/^(\+27|0)[6-8]\d{8}$/.test(phone)) {
    // South African mobile numbers: 06/07/08 prefixes, 9 digits after the
    // leading 0, or the +27 international form.
    errors.phoneNumber = 'Enter a valid South African mobile number, e.g. 081 234 5678.'
  }

  if (!values.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!values.password) {
    errors.password = 'Choose a password.'
  } else if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  return errors
}

export function RegisterPage() {
  // Resolved at bootstrap from the hostname (see main.tsx). Called here
  // rather than at module scope: imports are evaluated before main.tsx runs
  // setActiveTenant(), so a module-level call would throw on first import.
  const tenantConfig = activeTenant()
  const navigate = useNavigate()
  const { amount, term, hasInteracted } = useCalculator()
  const { data: product } = useActiveLoanProduct()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrorMap>({})
  const [loading, setLoading] = useState(false)

  // Clear a field's error as soon as the user edits it — leaving a stale
  // message under an input the user has already fixed reads as unresponsive.
  function clearError(field: RegisterField) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  const loanAmountRangeLabel = product
    ? `Loans from ${formatRand(product.minAmount)} to ${formatRand(product.maxAmount)}`
    : null
  const repaymentTermLabel = product ? `Repayment terms up to ${product.maxTermMonths} months` : null

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const validationErrors = validateRegistration({ firstName, lastName, phoneNumber, email, password })
    if (Object.values(validationErrors).some(Boolean)) {
      setErrors(validationErrors)
      focusFirstInvalidField(validationErrors)
      return
    }

    setErrors({})
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
      const attributed = attributeSignUpError(signUpError.message)
      if (attributed) {
        const next = { [attributed.field]: attributed.message }
        setErrors(next)
        focusFirstInvalidField(next)
      } else {
        setError(signUpError.message)
      }
      return
    }

    navigate('/apply')
  }

  return (
    <div className="split-auth">
      {/* Brand Panel */}
      <div className="auth-brand-panel">
        <Link to="/" className="brand-logo" aria-label={`${tenantConfig.displayName} home`}>
          <img src={tenantConfig.logoPath} alt="" className="brand-logo__mark" />
          <span>{tenantConfig.displayName}</span>
        </Link>
        <div>
          <h2>Start your business loan application today</h2>
          <p>Join hundreds of South African businesses that have grown with PRDF funding.</p>
        </div>
        <ul className="auth-brand-bullets">
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> 100% online — no branch visits</li>
          {loanAmountRangeLabel && (
            <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> {loanAmountRangeLabel}</li>
          )}
          {repaymentTermLabel && (
            <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> {repaymentTermLabel}</li>
          )}
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> NCR-registered</li>
        </ul>
        {hasInteracted && (
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
          {/* `id` doubles as the error key and the aria-describedby anchor —
              see packages/ui-kit/components/FieldError.tsx. `noValidate` is not
              set, so the browser's own required/type checks still run first. */}
          <div className="form-two-col">
            <div className="field-block">
              <label className="form-field" htmlFor="firstName">
              First name
              <input
                id="firstName"
                {...fieldErrorAttrs('firstName', errors.firstName)}
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); clearError('firstName') }}
                required
                autoComplete="given-name"
                placeholder="Thabo"
              />
              </label>
              <FieldError field="firstName" message={errors.firstName} />
            </div>
            <div className="field-block">
              <label className="form-field" htmlFor="lastName">
              Last name
              <input
                id="lastName"
                {...fieldErrorAttrs('lastName', errors.lastName)}
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); clearError('lastName') }}
                required
                autoComplete="family-name"
                placeholder="Mponya"
              />
              </label>
              <FieldError field="lastName" message={errors.lastName} />
            </div>
          </div>
          <div className="field-block">
            <label className="form-field" htmlFor="phoneNumber">
            Phone number
            <input
              id="phoneNumber"
              {...fieldErrorAttrs('phoneNumber', errors.phoneNumber)}
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              onChange={(e) => { setPhoneNumber(e.target.value); clearError('phoneNumber') }}
              required
              autoComplete="tel"
              placeholder="+27 81 234 5678"
            />
            </label>
            <FieldError field="phoneNumber" message={errors.phoneNumber} />
          </div>
          <div className="field-block">
            <label className="form-field" htmlFor="email">
            Email address
            <input
              id="email"
              {...fieldErrorAttrs('email', errors.email)}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError('email') }}
              required
              autoComplete="email"
              placeholder="you@business.co.za"
            />
            </label>
            <FieldError field="email" message={errors.email} />
          </div>
          <div className="field-block">
            <label className="form-field" htmlFor="password">
            Password
            <input
              id="password"
              {...fieldErrorAttrs('password', errors.password)}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError('password') }}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
            />
            </label>
            <FieldError field="password" message={errors.password} />
          </div>
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
