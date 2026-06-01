import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureAdmin } from '../auth/roles.helper';
import { PoolClient } from 'pg';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

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

  async grantAdmin(actor: CurrentUser, targetUserId: string) {
    ensureAdmin(actor.roles);

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await client.query(
        `select u.id, p.full_name, u.email, coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
         from auth.users u left join public.profiles p on p.user_id = u.id
         left join public.user_roles ur on ur.user_id = u.id left join public.roles r on r.id = ur.role_id
         where u.id = $1 group by u.id, p.full_name, u.email`,
        [targetUserId],
      );
      if (!target.rows[0]) throw new Error(`Target user was not found.`);
      const targetRoles: string[] = target.rows[0].roles;
      const isInternal = targetRoles.some((r: string) => ['Admin', 'LoanOfficer', 'Originator', 'Intern'].includes(r));
      if (!isInternal) throw new Error('Only existing internal users can be granted Admin access.');

      const roleRow = await client.query(`select id from public.roles where name = 'Admin' limit 1`);
      if (!roleRow.rows[0]) throw new Error('Admin role does not exist.');
      const adminRoleId = roleRow.rows[0].id;

      await client.query(
        `insert into public.user_roles (user_id, role_id) values ($1, $2) on conflict (user_id, role_id) do nothing`,
        [targetUserId, adminRoleId],
      );

      const afterRolesResult = await client.query(
        `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
        [targetUserId],
      );
      const afterRoles = afterRolesResult.rows.map((r: any) => r.name);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'AdminGranted', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ targetEmail: target.rows[0].email, priorRoles: targetRoles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles, isAdmin: afterRoles.includes('Admin') };
    });
  }

  async revokeAdmin(actor: CurrentUser, targetUserId: string) {
    ensureAdmin(actor.roles);
    if (actor.userId === targetUserId) throw new Error('Admins cannot revoke their own Admin access from this screen.');

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await client.query(
        `select u.id, p.full_name, u.email, coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
         from auth.users u left join public.profiles p on p.user_id = u.id
         left join public.user_roles ur on ur.user_id = u.id left join public.roles r on r.id = ur.role_id
         where u.id = $1 group by u.id, p.full_name, u.email`,
        [targetUserId],
      );
      if (!target.rows[0]) throw new Error(`Target user was not found.`);
      const targetRoles: string[] = target.rows[0].roles;
      if (!targetRoles.includes('Admin')) return { userId: targetUserId, roles: targetRoles, isAdmin: false };

      const adminCountResult = await client.query(
        `select cast(count(distinct ur.user_id) as int) as cnt from public.user_roles ur join public.roles r on r.id = ur.role_id where r.name = 'Admin'`,
      );
      if ((adminCountResult.rows[0].cnt as number) <= 1) throw new Error('Cannot revoke Admin access from the last remaining admin.');

      const roleRow = await client.query(`select id from public.roles where name = 'Admin' limit 1`);
      const adminRoleId = roleRow.rows[0].id;

      await client.query(`delete from public.user_roles where user_id = $1 and role_id = $2`, [targetUserId, adminRoleId]);

      const afterRolesResult = await client.query(
        `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
        [targetUserId],
      );
      const afterRoles = afterRolesResult.rows.map((r: any) => r.name);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'AdminRevoked', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ targetEmail: target.rows[0].email, priorRoles: targetRoles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles, isAdmin: false };
    });
  }
}
