import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env'

let authClient: SupabaseClient | null = null

export function getSupabaseAuthClient(): SupabaseClient {
  if (authClient) return authClient

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.warn('Missing Supabase frontend env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }

  authClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  return authClient
}

export function createSupabaseDataClient(accessToken: string): SupabaseClient {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  })
}
