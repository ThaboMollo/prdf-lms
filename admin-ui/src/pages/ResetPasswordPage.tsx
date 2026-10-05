import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePasswordRecovery } from '../../../packages/ui-kit/hooks/usePasswordRecovery'
import { FieldError, fieldErrorAttrs } from '../components/shared/FieldError'
import { CardSkeleton } from '../components/shared/Skeletons'

/**
 * Where the "Forgot password?" email lands (see LoginPage).
 *
 * Public route by design: the recovery token in the URL is the credential, so
 * this must render before RequireAuth would bounce an unauthenticated visitor
 * to /login — which is where the link used to dead-end. The state machine and
 * the Supabase calls live in usePasswordRecovery, shared with client-ui; this
 * file is only the admin-console dressing.
 *
 * Worth knowing about MFA: in App.tsx this route sits after the MFA gates, so
 * a staff member with a verified factor normally answers the challenge before
 * the form appears. That is not a guarantee, and deliberately so — when
 * REQUIRE_MFA_FOR_STAFF is on, the API rejects the aal1 recovery session, the
 * profile fetch fails, and the gates (which need a loaded profile) are skipped,
 * leaving the form reachable. Recovery has to stay reachable or a forgotten
 * password becomes a lockout only another admin can clear; inbox control is
 * the credential at that point. The reset then signs out globally, so the
 * session they come back with does face the challenge.
 */
export function ResetPasswordPage() {
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
    <main className="auth-wrap">
      <section className="auth-card">
        {status === 'checking' ? <CardSkeleton /> : null}

        {status === 'invalid' ? (
          <>
            <h1>Link No Longer Valid</h1>
            <p>{linkError ?? 'This password reset link has expired or has already been used.'}</p>
            <p className="muted-text">
              Return to sign-in and choose <strong>Forgot password?</strong> to get a fresh link.
            </p>
            <button className="btn" type="button" onClick={() => navigate('/login')}>
              Back to Sign In
            </button>
          </>
        ) : null}

        {status === 'saved' ? (
          <>
            <h1>Password Updated</h1>
            <p>
              Your password has been changed. For security, every other session has been signed out
              — sign in again with your new password.
            </p>
            <button className="btn" type="button" onClick={() => navigate('/login')}>
              Sign In
            </button>
          </>
        ) : null}

        {status === 'ready' ? (
          <>
            <h1>Choose a New Password</h1>
            <p>Enter it twice so we can be sure it's typed the way you meant.</p>
            <form onSubmit={onSubmit} className="form-grid">
              <div className="field-block">
                <label htmlFor="password">
                  New password
                  <input
                    id="password"
                    {...fieldErrorAttrs('password', fieldErrors.password)}
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password') }}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    autoFocus
                  />
                </label>
                <FieldError field="password" message={fieldErrors.password} />
              </div>
              <div className="field-block">
                <label htmlFor="confirmPassword">
                  Confirm new password
                  <input
                    id="confirmPassword"
                    {...fieldErrorAttrs('confirmPassword', fieldErrors.confirmPassword)}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword') }}
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </label>
                <FieldError field="confirmPassword" message={fieldErrors.confirmPassword} />
              </div>
              <button className={`btn${saving ? ' btn-loading' : ''}`} type="submit" disabled={saving}>
                {saving ? '' : 'Update Password'}
              </button>
            </form>
            {error ? <p className="text-error" role="alert">{error}</p> : null}
            <p className="muted-text">Password must be at least 8 characters.</p>
          </>
        ) : null}
      </section>
    </main>
  )
}
