export const APP_ROLES = ['Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin'] as const

export type AppRole = (typeof APP_ROLES)[number]

const rolePriority: AppRole[] = ['Admin', 'LoanOfficer', 'Originator', 'Intern', 'Client']

export function normalizeRole(value: string): AppRole | null {
  const clean = value.trim().toLowerCase()
  if (clean === 'admin') return 'Admin'
  if (clean === 'loanofficer' || clean === 'loan_officer' || clean === 'loan officer') return 'LoanOfficer'
  if (clean === 'originator') return 'Originator'
  if (clean === 'intern') return 'Intern'
  if (clean === 'client') return 'Client'
  return null
}

export function toAppRoles(values: string[] | undefined | null): AppRole[] {
  if (!values?.length) return ['Client']
  const normalized = values
    .map(normalizeRole)
    .filter((item): item is AppRole => Boolean(item))

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

export function isInternalRole(role: AppRole): boolean {
  return role !== 'Client'
}
