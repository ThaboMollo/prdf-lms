import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().optional().default(''),
  VITE_SUPABASE_ANON_KEY: z.string().optional().default(''),
  VITE_API_BASE_URL: z.string().optional().default('http://localhost:3000'),
  VITE_ENABLE_NOTIFICATIONS: z.enum(['true', 'false']).optional().default('false'),
  VITE_SENTRY_DSN: z.string().optional().default(''),
  // Gates the *enrolment* prompt only. A verified factor always triggers the
  // challenge regardless. Must stay 'false' until MFA is enabled on the
  // Supabase project and staff have enrolled — see docs/outstanding-work.md S4.
  VITE_REQUIRE_MFA: z.enum(['true', 'false']).optional().default('false')
})

const parsedEnv = envSchema.safeParse(import.meta.env)

if (!parsedEnv.success) {
  throw new Error(`Invalid admin UI environment: ${parsedEnv.error.message}`)
}

export const env = parsedEnv.data
