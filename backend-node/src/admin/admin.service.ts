import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureAdminOrSuper, ensureSuperAdmin } from '../auth/roles.helper';
import { currentTenant } from '../tenancy/request-context';
import axios from 'axios';

// SuperAdmin is deliberately absent: it is the out-of-band platform-owner
// capability, not a role that can be granted or revoked through the app.
const KNOWN_ROLES = ['Admin', 'LoanOfficer', 'Intern', 'Originator', 'Client'];
const ELEVATED_ROLES = ['Admin'];

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  private ensureKnownRole(roleName: string) {
    if (!KNOWN_ROLES.includes(roleName)) throw new BadRequestException(`Unknown role: ${roleName}`);
  }

  async listUserAccess(actor: CurrentUser, query: { filter?: string; role?: string; search?: string }) {
    ensureAdminOrSuper(actor.roles);
    const search = query.search?.trim() || null;
    const roleFilter = query.role?.trim() || null;
    const normalizedFilter = (query.filter ?? 'all').toLowerCase();

    const rows = await this.db.query<{
      userId: string;
      fullName: string | null;
      email: string | null;
      roles: string[];
      isAdmin: boolean;
      isInternal: boolean;
      canGrant: boolean;
      canRevoke: boolean;
      grantDisabledReason: string | null;
      revokeDisabledReason: string | null;
    }>(
      `select user_id as "userId", full_name as "fullName", email, roles,
              is_admin as "isAdmin", is_internal as "isInternal",
              can_grant_admin as "canGrant", can_revoke_admin as "canRevoke",
              grant_disabled_reason as "grantDisabledReason",
              revoke_disabled_reason as "revokeDisabledReason"
       from public.admin_access_list_visible($1, $2, $3)`,
      [search, normalizedFilter, roleFilter],
    );
    return rows;
  }

  async assignRole(actor: CurrentUser, targetUserId: string, roleName: string) {
    this.ensureKnownRole(roleName);
    if (ELEVATED_ROLES.includes(roleName)) {
      ensureSuperAdmin(actor.roles);
    } else {
      ensureAdminOrSuper(actor.roles);
    }

    const result = await this.db.queryOne<{ userId: string; roles: string[]; isAdmin: boolean }>(
      `select user_id as "userId", roles, is_admin as "isAdmin"
       from public.admin_access_assign_managed_role($1, $2)`,
      [targetUserId, roleName],
    );
    if (!result) throw new BadRequestException('Role assignment did not return a result.');
    return result;
  }

  async removeRole(actor: CurrentUser, targetUserId: string, roleName: string) {
    this.ensureKnownRole(roleName);
    if (ELEVATED_ROLES.includes(roleName)) {
      ensureSuperAdmin(actor.roles);
      if (actor.userId === targetUserId) {
        throw new Error(`You cannot revoke your own ${roleName} access.`);
      }
    } else {
      ensureAdminOrSuper(actor.roles);
    }

    const result = await this.db.queryOne<{ userId: string; roles: string[]; isAdmin: boolean }>(
      `select user_id as "userId", roles, is_admin as "isAdmin"
       from public.admin_access_remove_managed_role($1, $2)`,
      [targetUserId, roleName],
    );
    if (!result) throw new BadRequestException('Role removal did not return a result.');
    return result;
  }

  /**
   * Delete every MFA factor for a user, so they can enrol again from scratch.
   *
   * This is the ONLY recovery path from an MFA lockout. Supabase has no
   * self-service reset: a staff member who loses or wipes their authenticator
   * cannot get past the challenge screen, and once REQUIRE_MFA_FOR_STAFF is on
   * they lose API access entirely. Without this endpoint, that is permanent.
   *
   * SuperAdmin only, and never self-service — resetting your own factor would
   * make MFA trivially bypassable by anyone who has your password, which is
   * precisely the thing it exists to stop.
   *
   * Deliberately audited with the factor count: this action lowers an
   * account's assurance level, so it must be visible in the audit log
   * afterwards, not merely permitted.
   */
  async resetMfa(actor: CurrentUser, targetUserId: string) {
    ensureSuperAdmin(actor.roles);

    if (actor.userId === targetUserId) {
      throw new Error(
        'You cannot reset your own MFA. Ask another SuperAdmin — a self-service reset would let anyone with your password remove your second factor.',
      );
    }

    const tenant = currentTenant();
    const base = tenant.supabaseUrl.replace(/\/$/, '');
    const headers = {
      Authorization: `Bearer ${tenant.serviceRoleKey}`,
      apikey: tenant.serviceRoleKey,
      'Content-Type': 'application/json',
    };

    // The admin factor list/delete endpoints are the only way to remove a
    // factor on another user's behalf; the client-side mfa.unenroll() acts on
    // the caller's own session.
    const listed = await axios.get(`${base}/auth/v1/admin/users/${targetUserId}/factors`, { headers });
    const factors: Array<{ id: string }> = listed.data?.factors ?? listed.data ?? [];

    for (const factor of factors) {
      await axios.delete(`${base}/auth/v1/admin/users/${targetUserId}/factors/${factor.id}`, { headers });
    }

    await this.db.execute(
      `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'MfaReset', $2, $3::jsonb)`,
      [targetUserId, actor.userId, JSON.stringify({ factorsRemoved: factors.length })],
    );

    return { userId: targetUserId, factorsRemoved: factors.length };
  }
}
