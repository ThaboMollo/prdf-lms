import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type MfaState =
  | 'loading'
  | 'satisfied'      // aal2, or nothing required of this user
  | 'challenge'      // has a verified factor but the session is still aal1
  | 'enrolment'      // internal user with no factor, and MFA is required

/**
 * Decides which MFA gate (if any) an authenticated session needs to pass.
 *
 * Two distinct conditions, often conflated:
 *
 *  - `challenge`  — the account HAS a verified factor, so Supabase reports
 *    nextLevel 'aal2'. This is enforced regardless of the feature flag: once a
 *    factor exists, an aal1 session is half-authenticated and the API will
 *    reject it when enforcement is on.
 *
 *  - `enrolment`  — the account has NO factor. Only gates when `required` is
 *    true, because forcing enrolment before MFA is enabled on the Supabase
 *    project would lock staff out of a system they can't yet enrol in.
 */
export function useMfaStatus(isInternalUser: boolean, required: boolean) {
  const [state, setState] = useState<MfaState>('loading')

  const refresh = useCallback(async () => {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aalError) {
      // Most likely MFA isn't enabled on the project. Failing open here is
      // deliberate: the API is the real enforcement point, and blocking the
      // whole admin UI because a capability check errored would be worse than
      // the risk it mitigates.
      setState('satisfied')
      return
    }

    if (aal?.currentLevel === 'aal2') {
      setState('satisfied')
      return
    }

    if (aal?.nextLevel === 'aal2') {
      setState('challenge')
      return
    }

    if (isInternalUser && required) {
      setState('enrolment')
      return
    }

    setState('satisfied')
  }, [isInternalUser, required])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { state, refresh }
}
