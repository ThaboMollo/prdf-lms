import type { DatabaseService } from '../database/database.service';

export const STAFF_ROLES = ['Admin', 'LoanOfficer'] as const;
export const ASSIGNED_ROLES = ['Intern', 'Originator'] as const;
export const INTERNAL_ROLES = ['Admin', 'LoanOfficer', 'Intern', 'Originator'] as const;

export interface CurrentUser {
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

/**
 * The single source of truth for role derivation — was previously duplicated
 * three ways (this function, an inline query in SupabaseAuthGuard, and
 * DocumentsService.getRoles()). Roles are always re-derived from
 * user_roles/roles at query time, never trusted from JWT claims, matching
 * the database's own is_in_role() convention.
 */
export async function fetchUserRoles(db: DatabaseService, userId: string): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
    [userId],
  );
  return [...new Set(rows.map((r) => r.name))];
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
