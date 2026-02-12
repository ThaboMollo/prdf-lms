import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().optional().default(''),
  VITE_SUPABASE_ANON_KEY: z.string().optional().default(''),
  VITE_API_BASE_URL: z.string().optional().default('http://localhost:5080'),
  VITE_DATA_PROVIDER: z.enum(['supabase', 'api']).optional().default('supabase'),
  VITE_ENABLE_API_PROVIDER: z.enum(['true', 'false']).optional().default('false'),
  VITE_ENABLE_NOTIFICATIONS: z.enum(['true', 'false']).optional().default('false'),
  VITE_SUPABASE_DOCS_BUCKET: z.string().optional().default('loan-documents')
})

const parsedEnv = envSchema.safeParse(import.meta.env)

if (!parsedEnv.success) {
  throw new Error(`Invalid frontend environment: ${parsedEnv.error.message}`)
}

export const env = parsedEnv.data
