import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { activeTenant } from '../../../packages/tenant-config'
import { usePasswordRecovery } from '../../../packages/ui-kit/hooks/usePasswordRecovery'
import { FieldError, fieldErrorAttrs } from '../components/shared/FieldError'
import { CardSkeleton } from '../components/shared/Skeletons'

/**
 * Where the "Forgot your password?" email lands (see LoginPage).
 *
 * Public route by design: the recovery token in the URL is the credential, so
 * this must render before RequireAuth would bounce an unauthenticated visitor
 * to /login — which is where the link used to dead-end. The state machine and
 * the Supabase calls live in usePasswordRecovery, shared with admin-ui; this
 * file is only the client-portal dressing.
 */
export function ResetPasswordPage() {
  // Resolved at bootstrap from the hostname (see main.tsx). Called here rather
  // than at module scope: imports are evaluated before main.tsx runs
  // setActiveTenant(), so a module-level call would throw on first import.
  const tenantConfig = activeTenant()
  const navigate = useNavigate()
  const { status, linkError, error, fieldErrors, saving, clearFieldError, submit } =
    usePasswordRecovery(supabase)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit(password, confirmPassword)
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
          <h2>Set a New Password</h2>
          <p>Choose a new password, then sign in with it to pick up where you left off.</p>
        </div>
        <ul className="auth-brand-bullets">
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Use at least 8 characters</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Avoid a password you use elsewhere</li>
          <li><span className="bullet-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span> Signs you out everywhere, just in case</li>
        </ul>
      </div>

      {/* Form Panel */}
      <div className="auth-form-panel">
        {status === 'checking' ? <CardSkeleton /> : null}

        {status === 'invalid' ? (
          <>
            <div>
              <h1>Link no longer valid</h1>
              <p>{linkError ?? 'This password reset link has expired or has already been used.'}</p>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Head back to sign-in and choose <strong>Forgot your password?</strong> to get a fresh
              link.
            </p>
            <Link className="btn btn-primary" to="/login">
              Back to Sign In
            </Link>
          </>
        ) : null}

        {status === 'saved' ? (
          <>
            <div>
              <h1>Password updated</h1>
              <p>
                Your password has been changed. For your security we've signed you out everywhere —
                sign in again with your new password.
              </p>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => navigate('/login')}>
              Sign In
            </button>
          </>
        ) : null}

        {status === 'ready' ? (
          <>
            <div>
              <h1>Choose a new password</h1>
              <p>Enter it twice so we can be sure it's typed the way you meant.</p>
            </div>
            <form onSubmit={onSubmit} className="form-grid">
              <div className="field-block">
                <label className="form-field" htmlFor="password">
                New password
                <input
                  id="password"
                  {...fieldErrorAttrs('password', fieldErrors.password)}
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError('password') }}
                  required
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                  autoFocus
                />
                </label>
                <FieldError field="password" message={fieldErrors.password} />
              </div>
              <div className="field-block">
                <label className="form-field" htmlFor="confirmPassword">
                Confirm new password
                <input
                  id="confirmPassword"
                  {...fieldErrorAttrs('confirmPassword', fieldErrors.confirmPassword)}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword') }}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  minLength={8}
                />
                </label>
                <FieldError field="confirmPassword" message={fieldErrors.confirmPassword} />
              </div>
              <button
                className={`btn btn-primary${saving ? ' btn-loading' : ''}`}
                type="submit"
                disabled={saving}
                style={{ marginTop: '0.5rem' }}
              >
                {saving ? '' : 'Update Password'}
              </button>
            </form>
            {error ? <p className="text-error" role="alert">{error}</p> : null}
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Remembered it after all?{' '}
              <Link to="/login" style={{ fontWeight: 600 }}>
                Back to sign in
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
