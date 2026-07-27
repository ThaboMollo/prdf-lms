import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureAdminOrSuper, ensureSuperAdmin, hasRole } from '../auth/roles.helper';
import { PoolClient } from 'pg';

const KNOWN_ROLES = ['SuperAdmin', 'Admin', 'LoanOfficer', 'Intern', 'Originator', 'Client'];
// Mirrors the old admin_access_assign_role/admin_access_remove_role RPCs
// (infra/supabase/migrations/20260723180000_baseline.sql:486-680) exactly:
// "granted/revoked by a SuperAdmin; everything else requires Admin or
// above. SuperAdmin implies Admin." These two get last-holder/self-revoke
// protection and a stricter actor gate; the other four are managed as
// casually as they always were.
const ELEVATED_ROLES = ['SuperAdmin', 'Admin'];
const INTERNAL_ROLES = ['SuperAdmin', 'Admin', 'LoanOfficer', 'Originator', 'Intern'];

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  private ensureKnownRole(roleName: string) {
    if (!KNOWN_ROLES.includes(roleName)) throw new BadRequestException(`Unknown role: ${roleName}`);
  }

  async listUserAccess(actor: CurrentUser, query: { filter?: string; role?: string; search?: string }) {
    ensureAdminOrSuper(actor.roles);
    const actorIsSuperAdmin = hasRole(actor.roles, 'SuperAdmin');

    const search = query.search?.trim() || null;
    const roleFilter = query.role?.trim() || null;

    const rows = await this.db.query<{
      userid: string; fullname: string | null; email: string | null; roles: string[];
    }>(
      `select u.id as userid,
              p.full_name as fullname,
              u.email as email,
              coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
       from auth.users u
       left join public.profiles p on p.user_id = u.id
       left join public.user_roles ur on ur.user_id = u.id
       left join public.roles r on r.id = ur.role_id
       group by u.id, p.full_name, u.email
       having ($1::text is null or coalesce(p.full_name,'') ilike '%' || $1 || '%' or coalesce(u.email,'') ilike '%' || $1 || '%')
          and ($2::text is null or bool_or(r.name = $2))
       order by coalesce(p.full_name, u.email, u.id::text)`,
      [search, roleFilter],
    );

    const normalizedFilter = (query.filter ?? 'all').toLowerCase();
    const adminCount = rows.filter((r) => r.roles.includes('Admin')).length;

    return rows
      .map((row) => ({
        row,
        isAdmin: row.roles.includes('Admin'),
        isSuperAdmin: row.roles.includes('SuperAdmin'),
        isInternal: row.roles.some((r) => INTERNAL_ROLES.includes(r)),
      }))
      .filter(({ isAdmin, isInternal }) => {
        if (normalizedFilter === 'internal') return isInternal;
        if (normalizedFilter === 'clients') return !isInternal;
        if (normalizedFilter === 'admins') return isAdmin;
        if (normalizedFilter === 'non-admins') return isInternal && !isAdmin;
        return true;
      })
      .map(({ row, isAdmin, isSuperAdmin, isInternal }) => {
        const isSelf = row.userid === actor.userId;
        const isLastAdmin = isAdmin && adminCount <= 1;

        return {
          userId: row.userid,
          fullName: row.fullname,
          email: row.email,
          roles: row.roles,
          isAdmin,
          isSuperAdmin,
          isInternal,
          canGrant: actorIsSuperAdmin && !isAdmin,
          canRevoke: actorIsSuperAdmin && isAdmin && !isSelf && !isLastAdmin,
          grantDisabledReason: !actorIsSuperAdmin
            ? 'Only a SuperAdmin can grant Admin access.'
            : (isAdmin ? 'User already has Admin access.' : null),
          revokeDisabledReason: !actorIsSuperAdmin
            ? 'Only a SuperAdmin can revoke Admin access.'
            : (!isAdmin ? 'User does not currently have Admin access.' : (isSelf ? 'You cannot revoke your own Admin access.' : (isLastAdmin ? 'This is the last remaining admin.' : null))),
        };
      });
  }

  private async loadTarget(client: PoolClient, targetUserId: string) {
    const target = await client.query(
      `select u.id, p.full_name, u.email, coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
       from auth.users u left join public.profiles p on p.user_id = u.id
       left join public.user_roles ur on ur.user_id = u.id left join public.roles r on r.id = ur.role_id
       where u.id = $1 group by u.id, p.full_name, u.email`,
      [targetUserId],
    );
    if (!target.rows[0]) throw new Error('Target user was not found.');
    return target.rows[0] as { id: string; full_name: string | null; email: string | null; roles: string[] };
  }

  private async setRole(client: PoolClient, targetUserId: string, roleName: string) {
    const roleRow = await client.query(`select id from public.roles where name = $1 limit 1`, [roleName]);
    if (!roleRow.rows[0]) throw new Error(`${roleName} role does not exist.`);
    await client.query(
      `insert into public.user_roles (user_id, role_id) values ($1, $2) on conflict (user_id, role_id) do nothing`,
      [targetUserId, roleRow.rows[0].id],
    );
  }

  private async currentRoles(client: PoolClient, targetUserId: string): Promise<string[]> {
    const result = await client.query(
      `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
      [targetUserId],
    );
    return result.rows.map((r: any) => r.name);
  }

  async assignRole(actor: CurrentUser, targetUserId: string, roleName: string) {
    this.ensureKnownRole(roleName);
    if (ELEVATED_ROLES.includes(roleName)) {
      ensureSuperAdmin(actor.roles);
    } else {
      ensureAdminOrSuper(actor.roles);
    }

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await this.loadTarget(client, targetUserId);

      await this.setRole(client, targetUserId, roleName);
      // SuperAdmin implies Admin — granting SuperAdmin also grants Admin.
      if (roleName === 'SuperAdmin') {
        await this.setRole(client, targetUserId, 'Admin');
      }

      const afterRoles = await this.currentRoles(client, targetUserId);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'RoleAssigned', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ role: roleName, targetEmail: target.email, priorRoles: target.roles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles, isAdmin: afterRoles.includes('Admin'), isSuperAdmin: afterRoles.includes('SuperAdmin') };
    });
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

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await this.loadTarget(client, targetUserId);
      if (!target.roles.includes(roleName)) {
        return { userId: targetUserId, roles: target.roles, isAdmin: target.roles.includes('Admin'), isSuperAdmin: target.roles.includes('SuperAdmin') };
      }

      // SuperAdmin implies Admin — Admin can't be removed while SuperAdmin is still held.
      if (roleName === 'Admin' && target.roles.includes('SuperAdmin')) {
        throw new Error('Remove SuperAdmin before removing Admin.');
      }

      if (ELEVATED_ROLES.includes(roleName)) {
        const holderCountResult = await client.query(
          `select cast(count(distinct ur.user_id) as int) as cnt from public.user_roles ur join public.roles r on r.id = ur.role_id where r.name = $1`,
          [roleName],
        );
        if ((holderCountResult.rows[0].cnt as number) <= 1) {
          throw new Error(`Cannot revoke ${roleName} access from the last remaining holder.`);
        }
      }

      const roleRow = await client.query(`select id from public.roles where name = $1 limit 1`, [roleName]);
      await client.query(`delete from public.user_roles where user_id = $1 and role_id = $2`, [targetUserId, roleRow.rows[0].id]);

      const afterRoles = await this.currentRoles(client, targetUserId);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'RoleRemoved', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ role: roleName, targetEmail: target.email, priorRoles: target.roles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles, isAdmin: afterRoles.includes('Admin'), isSuperAdmin: afterRoles.includes('SuperAdmin') };
    });
  }
}
