import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldErrorMap } from '../components/FieldError'

/**
 * The state machine behind the reset-password screen, shared by both apps
 * (client-ui and admin-ui each render it with their own layout).
 *
 * How a user gets here: LoginPage calls `resetPasswordForEmail` with
 * `redirectTo: <origin>/reset-password`. Supabase mails a link that lands back
 * on that path carrying a recovery token. The client is on the implicit flow
 * (auth-js default — nothing sets `flowType`), so the token arrives in the URL
 * *fragment* and `detectSessionInUrl` exchanges it for a short-lived session
 * before this hook ever runs. That session is what authorises `updateUser`.
 *
 * So there is nothing to verify here by hand: either initialisation produced a
 * session (the link was good) or it did not (expired, already used, tampered).
 */

export type RecoveryStatus =
  /** Waiting for auth-js to finish parsing the URL. */
  | 'checking'
  /** A session exists — the new-password form can be shown. */
  | 'ready'
  /** No session: the link was expired, already used, or malformed. */
  | 'invalid'
  /** The password was changed and the recovery session has been revoked. */
  | 'saved'

/**
 * Read the failure Supabase reports when it rejects the link itself.
 *
 * Deliberately at module scope: when a link is bad, GoTrue redirects with
 * `error`/`error_code`/`error_description` in the fragment, and auth-js clears
 * the fragment while initialising. Module evaluation is synchronous and happens
 * during the import graph, before any promise auth-js scheduled can run, so
 * this snapshot is taken while those params are still there. Reading them in an
 * effect instead would be a race this would usually lose.
 *
 * Both fragment and query string are checked: which one carries the error
 * depends on whether the Supabase email template uses `{{ .ConfirmationURL }}`
 * (verify endpoint, fragment) or a token the app exchanges itself (query).
 */
function readLinkError(): string | null {
  if (typeof window === 'undefined') return null

  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const read = (key: string) => fragment.get(key) ?? query.get(key)

  const code = read('error_code')
  const description = read('error_description')
  if (!code && !description && !read('error')) return null

  // otp_expired covers both halves of the common case: Supabase expires
  // recovery links on a timer *and* on first use, and reports the same code
  // for each. Saying "expired or already used" avoids telling someone who just
  // clicked a fresh link that it timed out.
  if (code === 'otp_expired') {
    return 'This reset link has expired or has already been used. Request a new one to continue.'
  }

  // URLSearchParams has already percent-decoded this and turned '+' into
  // spaces, so the upstream wording is safe to show as-is.
  return description ?? 'This reset link is no longer valid. Request a new one to continue.'
}

const linkError = readLinkError()

/**
 * Attribute an `updateUser` failure to the password input where it belongs.
 *
 * Same trade-off as RegisterPage's `attributeSignUpError`: Supabase Auth
 * returns prose rather than a field name, so matching on English is
 * unavoidable here. Anything unmatched falls through to the banner instead of
 * being guessed onto a field, so a wording change upstream degrades to the old
 * behaviour rather than pointing at the wrong input.
 */
function attributeUpdateError(message: string): FieldErrorMap | null {
  const text = message.toLowerCase()

  if (text.includes('should be different') || text.includes('same as the old')) {
    return { password: 'Choose a password you have not used on this account before.' }
  }
  if (text.includes('password')) return { password: message }

  return null
}

/**
 * Client-side checks, run before the network call so obvious mistakes are
 * caught without a round trip. The 8-character floor mirrors RegisterPage;
 * like there, it is a convenience rather than the control — the Supabase
 * project's own password policy is what actually enforces strength, and
 * anything it rejects comes back through `attributeUpdateError`.
 */
export function validateNewPassword(password: string, confirmPassword: string): FieldErrorMap {
  const errors: FieldErrorMap = {}

  if (!password) {
    errors.password = 'Choose a new password.'
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Confirm your new password.'
  } else if (password && password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  return errors
}

export type UsePasswordRecovery = {
  status: RecoveryStatus
  /** Why the link was rejected — only set alongside status 'invalid'. */
  linkError: string | null
  /** Form-level error, for the banner. */
  error: string | null
  fieldErrors: FieldErrorMap
  saving: boolean
  clearFieldError: (field: string) => void
  /** Returns true once the password is changed, so callers can redirect. */
  submit: (password: string, confirmPassword: string) => Promise<boolean>
}

export function usePasswordRecovery(client: SupabaseClient): UsePasswordRecovery {
  const [status, setStatus] = useState<RecoveryStatus>('checking')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    // `getSession` awaits auth-js's own initialisation before resolving, which
    // is what makes a single call enough: by the time it answers, the recovery
    // token in the URL has either become a session or failed to. No listener
    // for PASSWORD_RECOVERY is needed — that event can fire before this
    // component mounts, so it cannot be relied on anyway.
    client.auth.getSession().then(({ data }) => {
      if (!active) return
      setStatus(data.session ? 'ready' : 'invalid')
    })

    return () => {
      active = false
    }
  }, [client])

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }, [])

  const submit = useCallback(
    async (password: string, confirmPassword: string) => {
      setError(null)

      const validationErrors = validateNewPassword(password, confirmPassword)
      if (Object.values(validationErrors).some(Boolean)) {
        setFieldErrors(validationErrors)
        return false
      }

      setFieldErrors({})
      setSaving(true)

      const { error: updateError } = await client.auth.updateUser({ password })
      if (updateError) {
        setSaving(false)
        const attributed = attributeUpdateError(updateError.message)
        if (attributed) {
          setFieldErrors(attributed)
        } else {
          setError(updateError.message)
        }
        return false
      }

      // Sign out globally, not locally. A password reset is the one moment the
      // account may be in someone else's hands, so every refresh token issued
      // before now is revoked rather than left alive on other devices. It also
      // means the user re-authenticates with the new password — which in
      // admin-ui puts them back through the MFA challenge rather than letting
      // an inbox-only recovery session walk past it.
      //
      // A failure here is not surfaced: the password HAS changed, and telling
      // the user the reset failed would send them back for another link they
      // no longer need. The recovery session expires on its own.
      await client.auth.signOut({ scope: 'global' }).catch(() => {})

      setSaving(false)
      setStatus('saved')
      return true
    },
    [client],
  )

  return {
    status,
    linkError: status === 'invalid' ? linkError : null,
    error,
    fieldErrors,
    saving,
    clearFieldError,
    submit,
  }
}
