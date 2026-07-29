import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().optional().default(''),
  VITE_SUPABASE_ANON_KEY: z.string().optional().default(''),
  VITE_API_BASE_URL: z.string().optional().default('http://localhost:3000'),
  VITE_ENABLE_NOTIFICATIONS: z.enum(['true', 'false']).optional().default('true'),
  VITE_SENTRY_DSN: z.string().optional().default(''),
  // Local-development override for tenant resolution: on localhost the
  // hostname matches no tenant's domains. Explicit opt-in, never a production
  // fallback — an unrecognised host with this unset shows the unknown-tenant
  // screen rather than defaulting to some tenant.
  VITE_TENANT_ID: z.string().optional().default('')
})

const parsedEnv = envSchema.safeParse(import.meta.env)

if (!parsedEnv.success) {
  throw new Error(`Invalid client UI environment: ${parsedEnv.error.message}`)
}

export const env = parsedEnv.data
