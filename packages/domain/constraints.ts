/**
 * The single source of truth for every validation rule that both sides enforce
 * (docs/validation-spec.md §1.2, workstream B).
 *
 * Before this file the rules lived in three places — the shared zod schemas,
 * client-ui's wizard schemas, and the class-validator DTOs — and the DTOs were
 * markedly the loosest of the three. `saCitizenshipPercentage` had no range
 * check, `numberOfEmployees` accepted 0, and four enum-ish fields accepted any
 * string at all. Anything enforced only in the browser is advisory, because the
 * API is directly callable; that is the same reasoning that drove the
 * server-side upload validation and the MFA decision.
 *
 * Deliberately plain TypeScript — no zod, no class-validator. Both validators
 * are built FROM this, so neither library's vocabulary leaks into the shared
 * definition and the backend can consume a generated mirror of it (see
 * backend-node/scripts/generate-constraints.mjs; the backend's tsconfig
 * `include: ["src/**\/*"]` prevents importing this directly).
 */

// ----------------------------------------------------------------
// Closed sets
// ----------------------------------------------------------------

export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const

export const SPATIAL_TYPES = ['Rural', 'Township', 'City'] as const

export const GENDERS = ['Male', 'Female', 'Prefer not to say'] as const

/**
 * Industries offered in the application wizard today — PRDF's blue/ocean
 * economy mandate.
 */
export const INDUSTRIES = [
  'Marine Tourism',
  'Marine Transport, logistics and Shipping',
  'Marine Biotechnology & Pharmaceuticals',
  'Seafood and Aquaculture',
  'Coastal and Port Infrastructure',
  'Shipbuilding and Repairs',
  'Clean Energy',
  'Sustainable Technologies',
  'All purchase orders outside these industries',
] as const

/**
 * Industries the wizard used to offer, retired on 2026-07-15 (commit 9504be9)
 * when the list was replaced wholesale for the blue-economy mandate.
 *
 * These are NOT offered in the dropdown — they exist only so the API still
 * accepts what it previously issued. Client profiles created before that date
 * hold these values, and a resumed draft or a profile update sends the stored
 * value straight back. Validating against the current list alone would reject
 * those users mid-application, with no security benefit: a closed legacy set
 * still stops arbitrary strings, which is the whole point of the check.
 *
 * Safe to delete once no `clients` row holds any of them.
 */
export const RETIRED_INDUSTRIES = [
  'Retail',
  'Manufacturing',
  'Construction',
  'Agriculture',
  'Technology',
  'Healthcare',
  'Education',
  'Transport & Logistics',
  'Hospitality',
  'Other',
] as const

/** What the API accepts. Offer INDUSTRIES; accept these. */
export const ACCEPTED_INDUSTRIES = [...INDUSTRIES, ...RETIRED_INDUSTRIES] as const

export type SaProvince = (typeof SA_PROVINCES)[number]
export type SpatialType = (typeof SPATIAL_TYPES)[number]
export type Gender = (typeof GENDERS)[number]
export type Industry = (typeof INDUSTRIES)[number]

// ----------------------------------------------------------------
// Numeric and length limits
// ----------------------------------------------------------------

/**
 * Note on requestedAmount / termMonths: their real bounds come from the tenant's
 * active `loan_products` row, not from here, so they are enforced per-request
 * rather than as a static constraint. The values below are the outer sanity
 * limits any product must sit inside — a guard against absurd input, not a
 * substitute for the product check.
 */
export const LIMITS = {
  businessName: { minLength: 2, maxLength: 200 },
  registrationNo: { minLength: 4, maxLength: 50 },
  purpose: { minLength: 5, maxLength: 1000 },
  sarsTaxPin: { minLength: 5, maxLength: 20 },
  bankName: { minLength: 2, maxLength: 100 },

  saCitizenshipPercentage: { min: 0, max: 100 },
  numberOfEmployees: { min: 1, max: 100000 },
  yearsInOperation: { min: 0, max: 100 },
  monthlyRevenue: { min: 0.01, max: 1_000_000_000 },

  requestedAmount: { min: 0.01, max: 1_000_000_000 },
  termMonths: { min: 1, max: 600 },
} as const

export type LimitKey = keyof typeof LIMITS
