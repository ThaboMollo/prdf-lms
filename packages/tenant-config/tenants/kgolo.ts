import type { TenantConfig } from '../schema';

/**
 * Client 2 brand direction: "Kgolo".
 * Warm, rounded, plain-spoken. Deliberately distinct from the institutional
 * blue direction used by client 1.
 *
 * Validated at build time against tenantConfigSchema. A missing or malformed
 * key must fail the build, not fall back to a default.
 */
export const kgolo: TenantConfig = {
  id: 'kgolo',
  displayName: 'Kgolo',
  tagline: 'Funding that grows with you',
  locale: 'en-ZA',
  currency: 'ZAR',
  logoPath: '/kgolo-logo.png',

  // Hostnames this tenant is served on (placeholders until the real domains
  // exist — resolution simply won't match until they are correct, which is
  // the intended failure mode: an unknown host shows an error rather than
  // another client's branding).
  domains: ['kgolo-lms.vercel.app', 'kgolo-admin.vercel.app'],

  // ---------------------------------------------------------------------------
  // Colour
  //
  // RULE: brand is for actions, navigation and chrome only. Never for status.
  // Status colours are shared across all tenants so that "rejected" always
  // reads the same way to staff and borrowers. Because this brand is coral,
  // and coral sits next to red, every status must also carry an icon. Colour
  // is never the only signal.
  // ---------------------------------------------------------------------------
  color: {
    brand: {
      50: '#FAECE7',
      100: '#F5C4B3',
      200: '#F0997B',
      400: '#D85A30',
      600: '#993C1D',
      800: '#712B13',
      900: '#4A1B0C',
    },
    brandOn: '#FFFFFF',
    surface: 'inherit',
    status: {
      verified: { fg: '#27500A', bg: '#EAF3DE', icon: 'file-check' },
      pending: { fg: '#5F5E5A', bg: 'surface-1', icon: 'file' },
      rejected: { fg: '#791F1F', bg: '#FCEBEB', icon: 'file-alert' },
      missing: { fg: '#4A1B0C', bg: '#FAECE7', icon: 'upload' },
    },
  },

  // ---------------------------------------------------------------------------
  // Radius, per breakpoint
  // ---------------------------------------------------------------------------
  radius: {
    mobile: { control: 12, card: 14, pill: 999 },
    desktop: { control: 14, card: 16, pill: 999 },
  },

  // ---------------------------------------------------------------------------
  // Type
  //
  // Single sans family. Two weights only, 400 and 500. Heavier weights read as
  // corporate and fight the warmth of the palette.
  // ---------------------------------------------------------------------------
  type: {
    sans: '"Inter var", system-ui, sans-serif',
    headingFamily: 'sans',
    weights: { regular: 400, medium: 500 },
    scale: {
      mobile: { caption: 11, body: 14, subheading: 16, heading: 18, title: 22 },
      desktop: { caption: 12, body: 15, subheading: 17, heading: 20, title: 26 },
    },
    lineHeight: { tight: 1.3, body: 1.6 },
  },

  // ---------------------------------------------------------------------------
  // Density
  //
  // Airy on desktop, tightened on mobile so the ten-document checklist stays
  // scannable rather than becoming a long scroll.
  // ---------------------------------------------------------------------------
  density: {
    mobile: { gapRow: 8, padControl: '11px 14px', padCard: '16px', padSection: '18px' },
    desktop: { gapRow: 10, padControl: '13px 16px', padCard: '20px', padSection: '24px' },
  },

  // ---------------------------------------------------------------------------
  // Motion
  // ---------------------------------------------------------------------------
  motion: {
    wizardTransition: 'slide',
    durationMs: { fast: 120, base: 220 },
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    respectReducedMotion: true,
  },

  // ---------------------------------------------------------------------------
  // Copy dictionary
  //
  // Same keys as every other tenant. Client 1 renders the formal string, this
  // tenant renders the plain one. Never branch on tenant id in a component to
  // pick wording; add the key here instead.
  // ---------------------------------------------------------------------------
  copy: {
    'wizard.step.loanDetails.title': 'How much do you need?',
    'wizard.step.businessProfile.title': 'Tell us about your business',
    'wizard.step.financials.title': 'Your numbers',
    'wizard.step.documents.title': 'Your documents',
    'wizard.step.review.title': 'Check everything over',
    'wizard.progress': 'Almost there',
    'wizard.cta.next': 'Keep going',
    'wizard.cta.submit': 'Send my application',
    'wizard.cta.saveDraft': 'Finish this later',
    'documents.counter': '{done} of {total} done',
    'documents.status.verified': 'Verified',
    'documents.status.pending': 'With reviewer',
    'documents.status.rejected': 'Needs a new copy',
    'documents.status.missing': 'Add file',
    'tracker.submitted': 'Submitted',
    'tracker.underReview': 'Under review',
    'tracker.approved': 'Approved',
    'tracker.disbursed': 'Disbursing',
    'tracker.inRepayment': 'Repaying',
    'tracker.closed': 'Closed',
    'eligibility.intro': 'A few quick questions before you start',
  },

  // ---------------------------------------------------------------------------
  // Feature flags
  //
  // These switch shared functionality on and off. They do not create new
  // behaviour. Anything not listed here is not configurable and must not be
  // branched on in a component.
  // ---------------------------------------------------------------------------
  features: {
    impactFields: true,
    eligibilitySelfCheck: true,
    nonFinancialSupport: false,
    inAppNotifications: true,
  },

  // ---------------------------------------------------------------------------
  // Wizard composition
  //
  // Order and grouping only. Steps must be a subset and reordering of the steps
  // client-core supports. Adding a step name not known to client-core is a
  // build error, not a runtime fallback.
  // ---------------------------------------------------------------------------
  wizard: {
    steps: ['businessProfile', 'financials', 'loanDetails', 'documents', 'review'],
    screensPerStep: 1,
    showStepCounter: false,
  },
  // PLACEHOLDER — copied verbatim from PRDF's criteria so this config is
  // type-complete and the tenant can be resolved. These are a real policy
  // question for this client and MUST be replaced with Kgolo's own criteria
  // before they take a single application; showing another lender's
  // eligibility rules to an applicant would be misleading.
  eligibility: {
    impact: {
      label: 'DEVELOPMENTAL IMPACT',
      items: [
        'Applicants who demonstrate expected Developmental Impact',
        'Projects must demonstrate targets for employment creation',
        'Applicants must be willing to participate in developmental programs',
        'Transactions from rural provinces must have rural community participation',
        'Projects must demonstrate sustainability',
        'The business must demonstrate capacity to repay the loan offered',
      ],
    },
    ownership: {
      label: 'OWNERSHIP & CONTROL',
      items: [
        'Enterprises must be >50.1% black women owned',
        'Applicants must be 90% South African nationals with operations controlled by SA citizens',
        'Enterprises must be 100% Director Operational',
        'Applicants must be permanent residents of South Africa',
      ],
    },
    compliance: {
      label: 'REGISTRATION & COMPLIANCE',
      items: [
        "The Enterprise(s) must be compliant with generally accepted corporate governance practices appropriate to the client's legal status",
        'The business must be registered with the CIPC',
        'The business must be registered with SARS as a taxpayer and in possession of a valid tax clearance certificate or a tax pin',
        'The members/shareholders of the business must not be unrehabilitated insolvents and not be under debt review or an administration order',
      ],
    },
  },
};
