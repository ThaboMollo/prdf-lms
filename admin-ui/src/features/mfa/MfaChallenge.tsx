import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Second-factor step for a session that has a verified TOTP factor but is
 * still at aal1 (spec §6.5).
 *
 * Shown as a blocking screen after password sign-in. There is no "skip":
 * once a factor is enrolled, Supabase reports nextLevel 'aal2', and the API
 * rejects aal1 for staff when REQUIRE_MFA_FOR_STAFF is on — so skipping would
 * only produce a session that fails every request.
 */
export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return
      setLoading(false)
      if (listError) {
        setError(listError.message)
        return
      }
      const verified = data?.totp?.find((f) => f.status === 'verified')
      if (!verified) {
        setError('No verified authenticator found for this account.')
        return
      }
      setFactorId(verified.id)
    })
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!factorId) return
    setVerifying(true)
    setError(null)

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challenge) {
      setVerifying(false)
      setError(challengeError?.message ?? 'Could not start the verification challenge.')
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    setVerifying(false)

    if (verifyError) {
      setError(verifyError.message)
      setCode('')
      return
    }

    onVerified()
  }

  async function onSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Two-factor verification</h1>
        <p>Enter the 6-digit code from your authenticator app.</p>

        {loading ? (
          <p className="muted-text">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} className="form-grid">
            <label>
              Authentication code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                required
              />
            </label>
            <button className="btn" type="submit" disabled={verifying || code.length !== 6 || !factorId}>
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}

        {error ? <p className="text-error">{error}</p> : null}

        <p style={{ marginTop: '1.5rem' }}>
          <button type="button" className="link-btn" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </section>
    </main>
  )
}
