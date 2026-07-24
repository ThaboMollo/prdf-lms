import type { TenantConfig } from '../schema';

/**
 * Client 1: PRDF. Reproduces current live behaviour — this is an extraction,
 * not a redesign. Every value below traces to something already in
 * client-ui/admin-ui; see the inline notes for exactly where.
 *
 * type/density/motion are populated with values matching current behaviour
 * where one exists, or a neutral default where none does (client-ui/admin-ui
 * have no per-breakpoint type scale, density scale, or motion tokens today —
 * those dimensions are invented here, not extracted, and are lower-confidence
 * than everything else in this file).
 */
export const prdf: TenantConfig = {
  id: 'prdf',
  displayName: 'PRDF',
  // Drawn from the actual hero copy in client-ui/src/pages/LandingPage.tsx
  // ("EMPOWERING SOUTH AFRICAN BUSINESSES TO GROW"), not invented.
  tagline: 'Empowering South African businesses to grow',
  locale: 'en-ZA',
  currency: 'ZAR',
  // File itself lives at client-ui/public/prdf-logo.png and admin-ui/public/prdf-logo.png (duplicated binary, same file).
  logoPath: '/prdf-logo.png',

  // ---------------------------------------------------------------------------
  // Colour
  //
  // client-ui/src/styles/global.css and admin-ui/src/styles/global.css each
  // hand-define the same ~30 vars today (confirmed identical, duplicated by
  // hand, no shared source): --brand (#1e40af), --brand-accent (#3b82f6),
  // --brand-dark (#1e3a8a). This scale's 800/900/600 steps are set to those
  // exact live values (not interpolated) so the bootstrap in main.tsx
  // reproduces current colours exactly; 50/100/200/400 are filled in from
  // the same Tailwind blue family for continuity, since nothing currently
  // uses them.
  // ---------------------------------------------------------------------------
  color: {
    brand: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      400: '#60a5fa',
      600: '#3b82f6', // = current --brand-accent (exact)
      800: '#1e40af', // = current --brand (exact)
      900: '#1e3a8a', // = current --brand-dark (exact)
    },
    brandOn: '#FFFFFF',
    surface: '#ffffff', // = current --surface
    status: {
      // fg/bg pairs traced to global.css's existing --ok/--danger/--alert(-soft) vars.
      verified: { fg: '#166534', bg: '#e9f7ef', icon: 'file-check' },
      pending: { fg: '#92400e', bg: '#fff3e2', icon: 'file' },
      rejected: { fg: '#b91c1c', bg: '#fce8e8', icon: 'file-alert' },
      // No existing "missing" semantic colour in the current app — this is a
      // reasonable neutral-but-branded choice, not an extraction. Flagged as
      // lower-confidence than the other three.
      missing: { fg: '#64748b', bg: '#eff2ff', icon: 'upload' },
    },
  },

  // ---------------------------------------------------------------------------
  // Radius
  //
  // Current CSS defines --radius/--radius-lg/--radius-sm all set to the same
  // 4px (not actually differentiated), plus ~10+ rules that bypass the vars
  // entirely with literal 8px/10px/12px/999px/50%. There is no existing
  // mobile/desktop split. Values below use the most common literal values
  // actually seen in the current stylesheets, applied uniformly across
  // breakpoints since no responsive radius behaviour exists today.
  // ---------------------------------------------------------------------------
  radius: {
    mobile: { control: 8, card: 10, pill: 999 },
    desktop: { control: 8, card: 10, pill: 999 },
  },

  // ---------------------------------------------------------------------------
  // Type
  //
  // Font families match global.css exactly (--font-heading/--font-body).
  // Weights and the per-breakpoint scale don't exist today in any form —
  // invented here as a reasonable starting point, not extracted.
  // ---------------------------------------------------------------------------
  type: {
    sans: '"Inter", system-ui, sans-serif',
    headingFamily: 'sans',
    weights: { regular: 400, medium: 600 },
    scale: {
      mobile: { caption: 12, body: 14, subheading: 16, heading: 20, title: 24 },
      desktop: { caption: 13, body: 15, subheading: 17, heading: 22, title: 28 },
    },
    lineHeight: { tight: 1.25, body: 1.5 },
  },

  // ---------------------------------------------------------------------------
  // Density — invented, no existing equivalent.
  // ---------------------------------------------------------------------------
  density: {
    mobile: { gapRow: 8, padControl: '10px 14px', padCard: '16px', padSection: '20px' },
    desktop: { gapRow: 10, padControl: '12px 16px', padCard: '20px', padSection: '24px' },
  },

  // ---------------------------------------------------------------------------
  // Motion — invented, no existing equivalent.
  // ---------------------------------------------------------------------------
  motion: {
    wizardTransition: 'none',
    durationMs: { fast: 120, base: 200 },
    easing: 'ease',
    respectReducedMotion: true,
  },

  // ---------------------------------------------------------------------------
  // Copy dictionary — deliberately sparse this pass (see file header). Only
  // keys actually consumed by wired-up code exist here; everything else in
  // client-ui/admin-ui remains inline JSX for now, by design.
  // ---------------------------------------------------------------------------
  copy: {
    'eligibility.intro':
      "Confirm that your business meets PRDF's eligibility criteria by checking each requirement below. All criteria must be met to proceed with a loan application.",
  },

  // ---------------------------------------------------------------------------
  // Feature flags — both reflect current always-on behaviour exactly. Wiring
  // these to actually gate rendering (the NFS tab, the Demographics/BEE
  // section) is part of this same pass; see admin-ui/ApplicationsPage.tsx and
  // client-ui/ApplyPage.tsx.
  // ---------------------------------------------------------------------------
  features: {
    impactFields: true,
    eligibilitySelfCheck: true,
    nonFinancialSupport: true,
    inAppNotifications: true,
  },

  // ---------------------------------------------------------------------------
  // Wizard composition — the current fixed order in
  // client-ui/src/pages/ApplyPage.tsx's STEPS array. Declarative documentation
  // of current behaviour only; ApplyPage's step machine does not yet actually
  // read this value (that data-driving work is explicitly deferred).
  // ---------------------------------------------------------------------------
  wizard: {
    steps: ['businessProfile', 'financials', 'loanDetails', 'documents', 'review'],
    screensPerStep: 1,
    showStepCounter: true,
  },

  // ---------------------------------------------------------------------------
  // Eligibility checklist — moved verbatim from
  // client-ui/src/pages/EligibilityCheckPage.tsx's CRITERIA object.
  // ---------------------------------------------------------------------------
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
