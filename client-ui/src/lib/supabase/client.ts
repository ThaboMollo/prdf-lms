import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env'

let authClient: SupabaseClient | null = null

export function getSupabaseAuthClient(): SupabaseClient {
  if (authClient) return authClient

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.warn('Missing Supabase client UI env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }

  authClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  return authClient
}
