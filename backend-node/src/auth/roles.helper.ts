import type { DatabaseService } from '../database/database.service';
import { PermissionError } from '../common/errors';

export const STAFF_ROLES = ['SuperAdmin', 'Admin', 'LoanOfficer'] as const;
export const ASSIGNED_ROLES = ['Intern', 'Originator'] as const;
export const INTERNAL_ROLES = ['SuperAdmin', 'Admin', 'LoanOfficer', 'Intern', 'Originator'] as const;

export interface CurrentUser {
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
  /**
   * Authenticator Assurance Level, taken from the verified JWT (spec §6.5).
   * 'aal1' = password only. 'aal2' = password plus a verified second factor.
   * Undefined on tokens minted before MFA was enabled on the project.
   *
   * This is one of the few claims that IS trusted from the token, and safely
   * so: it is set by Supabase Auth and the signature is verified before we
   * read it. Roles remain re-derived from the database — a user cannot mint
   * themselves an aal2 token any more than they can mint a valid signature.
   */
  aal?: string;
}

/**
 * Enforce a second factor for internal users (spec §6.5: "Staff can currently
 * approve loans up to R5,000,000 behind a single password").
 *
 * Gated by REQUIRE_MFA_FOR_STAFF so it can be deployed before staff have
 * enrolled — turning this on with nobody enrolled locks every staff member out
 * of the API. Rollout order: enable MFA in the Supabase dashboard, get staff
 * enrolled, then set this to true.
 *
 * Enforced here rather than only in admin-ui because the API is directly
 * callable; a UI-only check is decoration.
 */
export function ensureMfaSatisfied(user: CurrentUser): void {
  if (process.env.REQUIRE_MFA_FOR_STAFF !== 'true') return;
  if (!isInternal(user.roles)) return;
  if (user.aal === 'aal2') return;

  throw new PermissionError(
    'Multi-factor authentication is required for staff accounts. Sign in again and complete the second factor.',
  )
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
  const roles = [...new Set(rows.map((r) => r.name))];
  // SuperAdmin is the hidden platform-owner capability. It inherits Admin at
  // runtime without creating a user-manageable Admin assignment.
  if (hasRole(roles, 'SuperAdmin') && !hasRole(roles, 'Admin')) roles.push('Admin');
  return roles;
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
  if (!isStaff(roles)) throw new PermissionError('Only Admin or LoanOfficer can perform this action.')
}

export function ensureInternal(roles: string[]): void {
  if (!isInternal(roles)) throw new PermissionError('Only internal users can perform this action.')
}

export function ensureAdmin(roles: string[]): void {
  if (!hasRole(roles, 'Admin')) throw new PermissionError('Only Admin users can manage admin access.')
}

export function ensureAdminOrSuper(roles: string[]): void {
  if (!hasAnyRole(roles, 'Admin', 'SuperAdmin')) throw new PermissionError('Only Admin or SuperAdmin users can manage admin access.')
}

export function ensureSuperAdmin(roles: string[]): void {
  if (!hasRole(roles, 'SuperAdmin')) throw new PermissionError('Only a SuperAdmin can perform this action.')
}
