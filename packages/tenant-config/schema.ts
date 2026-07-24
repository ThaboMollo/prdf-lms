import { z } from 'zod';

// Plain TypeScript, imported via relative paths from client-ui/admin-ui —
// deliberately not a workspace package yet. See platform-architecture-design.md
// Phase 4 for when this becomes a real pnpm workspace member; introducing that
// now would require reconfiguring both live Vercel projects' Root Directory
// settings, which isn't safe to bundle into this pass.
//
// Only a subset of tenants actually populate every field below today (see
// tenants/prdf.ts) — colors, logo, the eligibility checklist, feature flags,
// and wizard step order are wired into the apps. type/density/motion and the
// full copy dictionary exist in this schema because tenants/kgolo.ts already
// defines them, but most of client-ui/admin-ui's copy remains inline JSX for
// now; that extraction is deliberately deferred, not done partially and
// silently.

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a 6-digit hex color, e.g. #1E40AF');

// 'inherit' and semantic tokens like 'surface-1' are allowed alongside real
// hex values — kgolo.tenant.ts uses both ('surface: inherit', 'bg: surface-1').
const colorValue = z.union([hexColor, z.string().min(1)]);

const statusTokenSchema = z.object({
  fg: colorValue,
  bg: colorValue,
  icon: z.string().min(1),
});

const colorSchema = z.object({
  brand: z.object({
    50: hexColor,
    100: hexColor,
    200: hexColor,
    400: hexColor,
    600: hexColor,
    800: hexColor,
    900: hexColor,
  }),
  brandOn: colorValue,
  surface: colorValue,
  status: z.object({
    verified: statusTokenSchema,
    pending: statusTokenSchema,
    rejected: statusTokenSchema,
    missing: statusTokenSchema,
  }),
});

const breakpointPair = <T extends z.ZodTypeAny>(shape: T) =>
  z.object({ mobile: shape, desktop: shape });

const radiusValuesSchema = z.object({
  control: z.number().nonnegative(),
  card: z.number().nonnegative(),
  pill: z.number().nonnegative(),
});

const typeScaleValuesSchema = z.object({
  caption: z.number().positive(),
  body: z.number().positive(),
  subheading: z.number().positive(),
  heading: z.number().positive(),
  title: z.number().positive(),
});

const typeSchema = z.object({
  sans: z.string().min(1),
  headingFamily: z.string().min(1),
  weights: z.object({
    regular: z.number().int().min(100).max(900),
    medium: z.number().int().min(100).max(900),
  }),
  scale: breakpointPair(typeScaleValuesSchema),
  lineHeight: z.object({
    tight: z.number().positive(),
    body: z.number().positive(),
  }),
});

const densityValuesSchema = z.object({
  gapRow: z.number().nonnegative(),
  padControl: z.string().min(1),
  padCard: z.string().min(1),
  padSection: z.string().min(1),
});

const motionSchema = z.object({
  wizardTransition: z.enum(['slide', 'fade', 'none']),
  durationMs: z.object({
    fast: z.number().nonnegative(),
    base: z.number().nonnegative(),
  }),
  easing: z.string().min(1),
  respectReducedMotion: z.boolean(),
});

// Feature flags switch existing shared functionality on/off — they never
// create new behaviour. Anything not listed here is not configurable and
// must not be branched on in a component.
const featuresSchema = z.object({
  impactFields: z.boolean(),
  eligibilitySelfCheck: z.boolean(),
  nonFinancialSupport: z.boolean(),
  inAppNotifications: z.boolean(),
});

// Closed set — matches client-core's known wizard steps exactly. A tenant
// listing a step name outside this enum fails validation at build time
// rather than silently falling back to something.
const wizardStepId = z.enum(['businessProfile', 'financials', 'loanDetails', 'documents', 'review']);

const wizardSchema = z.object({
  steps: z.array(wizardStepId).min(1),
  screensPerStep: z.number().int().positive(),
  showStepCounter: z.boolean(),
});

// Eligibility checklist — moved from client-ui/src/pages/EligibilityCheckPage.tsx's
// hardcoded CRITERIA object, which was already shaped almost exactly like this.
// The intro line lives in `copy['eligibility.intro']`, not here, since
// tenants/kgolo.ts already defines it there — no need for two homes for the
// same string.
const eligibilitySectionSchema = z.object({
  label: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
});

const eligibilitySchema = z.object({
  impact: eligibilitySectionSchema,
  ownership: eligibilitySectionSchema,
  compliance: eligibilitySectionSchema,
});

export const tenantConfigSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  tagline: z.string().min(1),
  locale: z.string().min(1),
  currency: z.string().length(3),
  /** Public-path to the tenant's logo image, e.g. "/prdf-logo.png" — the file itself still lives in each app's own public/ directory. */
  logoPath: z.string().min(1),

  color: colorSchema,
  radius: breakpointPair(radiusValuesSchema),
  type: typeSchema,
  density: breakpointPair(densityValuesSchema),
  motion: motionSchema,

  // Flat dictionary, same keys across every tenant — a tenant renders its own
  // wording for a key, components never branch on tenant id to pick copy.
  // Deliberately not exhaustive yet; see file header comment.
  copy: z.record(z.string(), z.string()),

  features: featuresSchema,
  wizard: wizardSchema,
  eligibility: eligibilitySchema,
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export function parseTenantConfig(config: unknown): TenantConfig {
  return tenantConfigSchema.parse(config);
}
