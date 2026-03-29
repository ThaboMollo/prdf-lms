import type { Session } from '@supabase/supabase-js'
import type { MeResponse } from '../lib/api'
import { ApplicationsPage } from './ApplicationsPage'

type ApplyPageProps = {
  session: Session
  me: MeResponse
}

export function ApplyPage({ session, me }: ApplyPageProps) {
  return <ApplicationsPage session={session} me={me} />
}
