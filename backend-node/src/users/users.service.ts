import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureInternal } from '../auth/roles.helper';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /** Staff eligible for application assignment. */
  async listAssignable(actor: CurrentUser) {
    // The admin UI exposes application/task assignment to every internal
    // role. Interns and Originators therefore need to be able to resolve the
    // same assignee list as Admins and Loan Officers.
    ensureInternal(actor.roles);
    const rows = await this.db.query<{ userId: string; fullName: string | null; email: string | null; roles: string[] }>(
      `select user_id as "userId", full_name as "fullName", email, roles
       from public.list_assignable_users()`,
    );
    return rows.map((r) => ({ userId: r.userId, name: r.fullName ?? r.email ?? r.userId, roles: r.roles }));
  }

  /** Batch user_id -> full_name resolution for uploader/note-author/assignee display names. */
  async getProfiles(actor: CurrentUser, ids: string[]) {
    ensureInternal(actor.roles);
    if (!ids.length) return [];
    const rows = await this.db.query<{ userId: string; fullName: string | null }>(
      `select user_id as "userId", full_name as "fullName" from public.profiles where user_id = any($1::uuid[])`,
      [ids],
    );
    return rows.filter((r) => r.fullName);
  }
}
