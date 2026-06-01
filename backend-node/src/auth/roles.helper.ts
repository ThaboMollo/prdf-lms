export const STAFF_ROLES = ['Admin', 'LoanOfficer'] as const;
export const ASSIGNED_ROLES = ['Intern', 'Originator'] as const;
export const INTERNAL_ROLES = ['Admin', 'LoanOfficer', 'Intern', 'Originator'] as const;

export interface CurrentUser {
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

export function hasRole(roles: string[], role: string): boolean {
  return roles.some((r) => r.toLowerCase() === role.toLowerCase());
}

export function hasAnyRole(roles: string[], ...expected: string[]): boolean {
  return expected.some((role) => hasRole(roles, role));
}

export function isStaff(roles: string[]): boolean {
  return hasAnyRole(roles, ...STAFF_ROLES);
}

export function isAssigned(roles: string[]): boolean {
  return hasAnyRole(roles, ...ASSIGNED_ROLES);
}

export function isInternal(roles: string[]): boolean {
  return hasAnyRole(roles, ...INTERNAL_ROLES);
}

export function isClient(roles: string[]): boolean {
  return hasRole(roles, 'Client');
}

export function ensureStaff(roles: string[]): void {
  if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform this action.');
}

export function ensureInternal(roles: string[]): void {
  if (!isInternal(roles)) throw new Error('Only internal users can perform this action.');
}

export function ensureAdmin(roles: string[]): void {
  if (!hasRole(roles, 'Admin')) throw new Error('Only Admin users can manage admin access.');
}
