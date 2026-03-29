import { env } from './env'

export type DataProvider = 'supabase' | 'api'

export function getDataProvider(): DataProvider {
  if (env.VITE_DATA_PROVIDER === 'api' && env.VITE_ENABLE_API_PROVIDER === 'true') {
    return 'api'
  }

  if (env.VITE_DATA_PROVIDER === 'api') {
    console.warn('VITE_DATA_PROVIDER=api is configured, but API provider is disabled. Falling back to supabase.')
  }

  return 'supabase'
}

export function isSupabaseProvider(): boolean {
  return getDataProvider() === 'supabase'
}
