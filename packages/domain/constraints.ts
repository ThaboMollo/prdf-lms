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
  purpose: { minWords: 50, maxLength: 1000 },
  sarsTaxPin: { minLength: 5, maxLength: 20 },
  bankName: { minLength: 2, maxLength: 100 },

  saCitizenshipPercentage: { min: 0, max: 100 },
  numberOfEmployees: { min: 1, max: 100000 },
  yearsInOperation: { min: 0, max: 100 },
  // Months *beyond* the whole years above, so 11 is the ceiling: "2 years and
  // 14 months" is not a thing an applicant should be able to enter.
  monthsInOperation: { min: 0, max: 11 },
  monthlyRevenue: { min: 0.01, max: 1_000_000_000 },

  requestedAmount: { min: 0.01, max: 1_000_000_000 },
  termMonths: { min: 1, max: 600 },
} as const

export type LimitKey = keyof typeof LIMITS

/**
 * Largest document an applicant may upload, confirmed by PRDF on 2026-10-05.
 *
 * This constant is the *client-side* half only. The browser uploads straight
 * to Supabase Storage through a signed URL, so the API never sees the bytes
 * and cannot check a size it is told — the authoritative control is the
 * `loan-documents` bucket's own `file_size_limit`, which must be kept equal to
 * this number. Checking here as well is what turns a silent storage rejection
 * into a message naming the file and the limit.
 */
export const DOCUMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024

/** The same limit, for user-facing copy. */
export const DOCUMENT_MAX_SIZE_LABEL = '5 MB'

/**
 * What an applicant may upload.
 *
 * These lived in backend-node/src/common/file-validation.ts with a comment
 * asking whoever changed them to remember to change the dropzones' `accept`
 * too — which was hardcoded at three call sites in client-ui and absent
 * altogether from admin-ui's uploader. A type the UI offers but the API
 * refuses is a dead end; a type the API takes but no UI offers is
 * unvalidated surface. One list removes the chance of either.
 */
export const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
] as const

/** The same list as an input's `accept` attribute: ".pdf,.doc,.docx". */
export const DOCUMENT_ACCEPT_ATTRIBUTE = ALLOWED_DOCUMENT_EXTENSIONS.join(',')

/**
 * Word count for the free-text loan purpose, which PRDF requires to be at least
 * `LIMITS.purpose.minWords` long (confirmed in the v1.1 manual review).
 *
 * Defined here rather than in each validator because the client blocks Continue
 * on this number while the server rejects a submission on it, and a counter
 * that disagrees with the rule it is counting towards is worse than no counter.
 * A "word" is any run of non-whitespace — crude, but it matches what someone
 * sees when they look at the sentence they just typed, which is the only
 * definition an applicant can act on.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/**
 * The purpose arrives at the API as "<category>: <free text>" — the Step 3
 * dropdown is folded into the same column before sending (see client-ui's
 * buildDraftPayload). Only the applicant's own words count towards the minimum,
 * so the prefix is stripped before counting; otherwise picking a longer
 * category from the dropdown would quietly earn them free words.
 */
export function stripPurposeCategory(purpose: string): string {
  return purpose.replace(/^[^:]*:\s*/, '')
}
