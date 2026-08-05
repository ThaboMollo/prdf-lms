export const APP_ROLES = [
  'Client',
  'IntakeClerk',
  'ProgramOfficer',
  'RiskAnalyst',
  'ReviewCommittee',
  'ProgramManager',
  'Board',
  'Legal',
  'FinanceOfficer',
  'Admin',
  'SuperAdmin',
] as const

export type AppRole = (typeof APP_ROLES)[number]

// SuperAdmin is an internal authorization capability, not a user-facing app
// role. Its inherited Admin role is what the UI should present. Ordered most-
// to least senior so getPrimaryRole surfaces the strongest badge.
const rolePriority: AppRole[] = [
  'Admin',
  'ProgramManager',
  'Board',
  'FinanceOfficer',
  'Legal',
  'ReviewCommittee',
  'RiskAnalyst',
  'ProgramOfficer',
  'IntakeClerk',
  'Client',
]

// Canonical name for each role, keyed by a lowercased/separator-stripped form so
// we tolerate 'program_officer'-style variants from the DB or older tokens.
const CANONICAL: Record<string, AppRole> = {
  superadmin: 'SuperAdmin',
  admin: 'Admin',
  intakeclerk: 'IntakeClerk',
  programofficer: 'ProgramOfficer',
  analyst: 'ProgramOfficer',
  riskanalyst: 'RiskAnalyst',
  reviewcommittee: 'ReviewCommittee',
  cru: 'ReviewCommittee',
  programmanager: 'ProgramManager',
  board: 'Board',
  bod: 'Board',
  legal: 'Legal',
  financeofficer: 'FinanceOfficer',
  finance: 'FinanceOfficer',
  client: 'Client',
}

export function normalizeRole(value: string): AppRole | null {
  const clean = value.trim().toLowerCase().replace(/[\s_-]/g, '')
  return CANONICAL[clean] ?? null
}

export function toAppRoles(values: string[] | undefined | null): AppRole[] {
  if (!values?.length) return ['Client']
  const normalized = values
    .map(normalizeRole)
    .filter((item): item is AppRole => Boolean(item))

  // SuperAdmin implies Admin so every Admin-gated guard also passes for them.
  if (normalized.includes('SuperAdmin') && !normalized.includes('Admin')) {
    normalized.push('Admin')
  }

  return normalized.length ? Array.from(new Set(normalized)) : ['Client']
}

export function getPrimaryRole(roles: AppRole[]): AppRole {
  for (const role of rolePriority) {
    if (roles.includes(role)) {
      return role
    }
  }

  return 'Client'
}

export function hasAnyRole(roles: AppRole[], allowed: readonly AppRole[]): boolean {
  return allowed.some((role) => roles.includes(role))
}

// Role groups for route/nav guards. SuperAdmin need not be listed — toAppRoles
// promotes it to Admin, so any 'Admin' guard already covers it.
export const WORKFLOW_ROLES: AppRole[] = [
  'IntakeClerk',
  'ProgramOfficer',
  'RiskAnalyst',
  'ReviewCommittee',
  'ProgramManager',
  'Board',
  'Legal',
  'FinanceOfficer',
]
// Anyone who works the console (sees the pipeline / a case).
export const ALL_INTERNAL_ROLES: AppRole[] = [...WORKFLOW_ROLES, 'Admin']
// Management / decision-makers: loans, portfolio, and reports.
export const MANAGEMENT_ROLES: AppRole[] = ['Admin', 'ProgramManager', 'Board']
// May move money (disbursement / repayment).
export const FINANCE_ROLES: AppRole[] = ['FinanceOfficer', 'Admin']

export function isInternalRole(role: AppRole): boolean {
  return role !== 'Client'
}

export function isInternalUser(roles: AppRole[]): boolean {
  return roles.some(isInternalRole)
}
