import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * TOTP enrolment (spec §6.5).
 *
 * Supabase's enroll() returns the QR code as an SVG data URI, so no QR
 * library is needed. The secret is shown alongside it for authenticator apps
 * that take manual entry.
 *
 * `dismissable` controls the rollout stance: during the grace period staff can
 * postpone and reach the app anyway; once VITE_REQUIRE_MFA is on, this becomes
 * a blocking screen. See docs/outstanding-work.md item S4 for the rollout
 * order — enforcing before staff enrol locks them out.
 */
export function MfaEnrolment({
  dismissable,
  onEnrolled,
  onDismiss,
}: {
  dismissable: boolean
  onEnrolled: () => void
  onDismiss?: () => void
}) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true

    async function start() {
      // A previous attempt can leave an unverified factor behind, and Supabase
      // rejects a second enrolment with the same friendly name. Clear those
      // first so a retry doesn't dead-end.
      // `listFactors().totp` is typed to verified factors only; unverified
      // ones are reachable via `all`.
      const { data: existing } = await supabase.auth.mfa.listFactors()
      const stale =
        existing?.all?.filter((f) => f.factor_type === 'totp' && f.status === 'unverified') ?? []
      for (const factor of stale) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (!active) return

      if (enrollError) {
        // The most common cause is MFA not being enabled on the Supabase
        // project yet, which is a configuration step rather than a bug.
        setError(
          `${enrollError.message} — if this persists, confirm multi-factor authentication is enabled for this Supabase project.`,
        )
        return
      }

      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
    }

    start()
    return () => {
      active = false
    }
  }, [])

  async function onVerify(event: React.FormEvent) {
    event.preventDefault()
    if (!factorId) return
    setBusy(true)
    setError(null)

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challenge) {
      setBusy(false)
      setError(challengeError?.message ?? 'Could not start the verification challenge.')
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    setBusy(false)

    if (verifyError) {
      setError(verifyError.message)
      setCode('')
      return
    }

    onEnrolled()
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Set up two-factor authentication</h1>
        <p>
          Staff accounts can approve loans of up to R5,000,000. A second factor means a stolen or
          guessed password is not enough on its own.
        </p>

        {qrCode ? (
          <>
            <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
            <img
              src={qrCode}
              alt="QR code for authenticator app enrolment"
              style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 8 }}
            />
            {secret ? (
              <p className="muted-text" style={{ wordBreak: 'break-all' }}>
                Can’t scan? Enter this key manually: <code>{secret}</code>
              </p>
            ) : null}

            <form onSubmit={onVerify} className="form-grid" style={{ marginTop: '1rem' }}>
              <label>
                Authentication code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  required
                />
              </label>
              <button className="btn" type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Confirm and enable'}
              </button>
            </form>
          </>
        ) : !error ? (
          <p className="muted-text">Preparing enrolment…</p>
        ) : null}

        {error ? <p className="text-error">{error}</p> : null}

        {dismissable && onDismiss ? (
          <p style={{ marginTop: '1.5rem' }}>
            <button type="button" className="link-btn" onClick={onDismiss}>
              Skip for now
            </button>
          </p>
        ) : null}
      </section>
    </main>
  )
}
