import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureStaff } from '../auth/roles.helper';

const ASSIGNABLE_ROLE_NAMES = ['Admin', 'LoanOfficer', 'Originator', 'Intern'];

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Staff eligible for application assignment — mirrors the inline
   * user_roles -> roles -> profiles join admin-ui's ApplicationsPage ran
   * directly against Supabase.
   */
  async listAssignable(actor: CurrentUser) {
    ensureStaff(actor.roles);
    const rows = await this.db.query<{ userId: string; fullName: string | null; roles: string[] }>(
      `select u.id as "userId", p.full_name as "fullName",
              coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
       from auth.users u
       join public.user_roles ur on ur.user_id = u.id
       join public.roles r on r.id = ur.role_id
       left join public.profiles p on p.user_id = u.id
       group by u.id, p.full_name
       having bool_or(r.name = any($1::text[]))
       order by coalesce(p.full_name, u.id::text)`,
      [ASSIGNABLE_ROLE_NAMES],
    );
    return rows.map((r) => ({ userId: r.userId, name: r.fullName ?? r.userId, roles: r.roles }));
  }

  /** Batch user_id -> full_name resolution for uploader/note-author/assignee display names. */
  async getProfiles(actor: CurrentUser, ids: string[]) {
    ensureStaff(actor.roles);
    if (!ids.length) return [];
    const rows = await this.db.query<{ userId: string; fullName: string | null }>(
      `select user_id as "userId", full_name as "fullName" from public.profiles where user_id = any($1::uuid[])`,
      [ids],
    );
    return rows.filter((r) => r.fullName);
  }
}
