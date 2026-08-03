import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type MyProfile = { fullName: string | null; phone: string | null };

@Injectable()
export class MeService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: string): Promise<MyProfile> {
    const row = await this.db.queryOne<MyProfile>(
      `select full_name as "fullName", phone from public.profiles where user_id = $1`,
      [userId],
    );
    return row ?? { fullName: null, phone: null };
  }

  /**
   * Upsert the caller's own profile. profiles.full_name is NOT NULL, so a
   * staffer who has no row yet (e.g. invited but never onboarded) can still
   * create one by saving their name. Scoped to the authenticated userId — the
   * controller never accepts a target user, so this can only touch self.
   */
  async updateProfile(userId: string, input: { fullName: string; phone?: string | null }): Promise<MyProfile> {
    await this.db.query(
      `insert into public.profiles (user_id, full_name, phone)
       values ($1, $2, $3)
       on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone`,
      [userId, input.fullName.trim(), input.phone?.trim() || null],
    );
    return this.getProfile(userId);
  }
}
