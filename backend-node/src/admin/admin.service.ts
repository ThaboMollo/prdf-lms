import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureAdmin } from '../auth/roles.helper';
import { PoolClient } from 'pg';

const KNOWN_ROLES = ['SuperAdmin', 'Admin', 'LoanOfficer', 'Intern', 'Originator', 'Client'];
// Roles with a lockout risk: only these get the "can't remove the last
// holder" / "can't remove your own" protections that Admin already had.
// The other four (LoanOfficer/Intern/Originator/Client) are assigned and
// removed as casually today as the rest of this endpoint always allowed.
const PROTECTED_ROLES = ['SuperAdmin', 'Admin'];

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  private ensureKnownRole(roleName: string) {
    if (!KNOWN_ROLES.includes(roleName)) throw new BadRequestException(`Unknown role: ${roleName}`);
  }

  async listUserAccess(actor: CurrentUser, query: { filter?: string; role?: string; search?: string }) {
    ensureAdmin(actor.roles);

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
       having bool_or(r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern'))
          and ($1::text is null or coalesce(p.full_name,'') ilike '%' || $1 || '%' or coalesce(u.email,'') ilike '%' || $1 || '%')
          and ($2::text is null or bool_or(r.name = $2))
       order by coalesce(p.full_name, u.email, u.id::text)`,
      [search, roleFilter],
    );

    const normalizedFilter = (query.filter ?? 'all').toLowerCase();
    const adminCount = rows.filter((r) => r.roles.includes('Admin')).length;

    return rows
      .filter((row) => {
        if (normalizedFilter === 'admins') return row.roles.includes('Admin');
        if (normalizedFilter === 'non-admins') return !row.roles.includes('Admin');
        return true;
      })
      .map((row) => {
        const isAdmin = row.roles.includes('Admin');
        const isInternal = row.roles.some((r) => ['Admin', 'LoanOfficer', 'Originator', 'Intern'].includes(r));
        const isSelf = row.userid === actor.userId;
        const isLastAdmin = isAdmin && adminCount <= 1;

        return {
          userId: row.userid,
          fullName: row.fullname,
          email: row.email,
          roles: row.roles,
          isAdmin,
          isInternal,
          canGrant: !isAdmin && isInternal,
          canRevoke: isAdmin && !isSelf && !isLastAdmin,
          grantDisabledReason: isAdmin ? 'User already has Admin access.' : (!isInternal ? 'Only internal users are eligible.' : null),
          revokeDisabledReason: !isAdmin ? 'User does not currently have Admin access.' : (isSelf ? 'You cannot revoke your own Admin access.' : (isLastAdmin ? 'This is the last remaining admin.' : null)),
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

  async assignRole(actor: CurrentUser, targetUserId: string, roleName: string) {
    ensureAdmin(actor.roles);
    this.ensureKnownRole(roleName);

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await this.loadTarget(client, targetUserId);

      // Preserves the exact pre-existing Admin-grant eligibility rule
      // (only already-internal users can be made Admin) — not extended to
      // other roles, since no such rule existed for them before.
      if (roleName === 'Admin') {
        const isInternal = target.roles.some((r) => ['Admin', 'LoanOfficer', 'Originator', 'Intern'].includes(r));
        if (!isInternal) throw new Error('Only existing internal users can be granted Admin access.');
      }

      const roleRow = await client.query(`select id from public.roles where name = $1 limit 1`, [roleName]);
      if (!roleRow.rows[0]) throw new Error(`${roleName} role does not exist.`);

      await client.query(
        `insert into public.user_roles (user_id, role_id) values ($1, $2) on conflict (user_id, role_id) do nothing`,
        [targetUserId, roleRow.rows[0].id],
      );

      const afterRolesResult = await client.query(
        `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
        [targetUserId],
      );
      const afterRoles = afterRolesResult.rows.map((r: any) => r.name);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'RoleAssigned', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ role: roleName, targetEmail: target.email, priorRoles: target.roles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles };
    });
  }

  async removeRole(actor: CurrentUser, targetUserId: string, roleName: string) {
    ensureAdmin(actor.roles);
    this.ensureKnownRole(roleName);

    if (PROTECTED_ROLES.includes(roleName) && actor.userId === targetUserId) {
      throw new Error(`You cannot revoke your own ${roleName} access.`);
    }

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await this.loadTarget(client, targetUserId);
      if (!target.roles.includes(roleName)) {
        return { userId: targetUserId, roles: target.roles };
      }

      if (PROTECTED_ROLES.includes(roleName)) {
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

      const afterRolesResult = await client.query(
        `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
        [targetUserId],
      );
      const afterRoles = afterRolesResult.rows.map((r: any) => r.name);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'RoleRemoved', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ role: roleName, targetEmail: target.email, priorRoles: target.roles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles };
    });
  }
}
