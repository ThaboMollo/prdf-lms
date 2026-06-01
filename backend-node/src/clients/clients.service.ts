import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureInternal } from '../auth/roles.helper';
import axios from 'axios';
import { randomUUID } from 'crypto';

@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}

  async createAssistedClient(actor: CurrentUser, body: {
    businessName: string; registrationNo?: string; address?: string;
    applicantEmail?: string; applicantFullName?: string; sendInvite?: boolean; redirectTo?: string;
  }) {
    ensureInternal(actor.roles);
    const clientId = randomUUID();
    let invitedUserId: string | null = null;

    if (body.sendInvite && body.applicantEmail) {
      invitedUserId = await this.inviteUser(body.applicantEmail, body.applicantFullName, body.redirectTo);
      if (invitedUserId) {
        await this.prepareUserProfile(invitedUserId, body.applicantEmail, body.applicantFullName);
      }
    }

    await this.db.execute(
      `insert into public.clients (id, user_id, business_name, registration_no, address, created_at)
       values ($1, $2, $3, $4, $5, now())`,
      [clientId, invitedUserId, body.businessName, body.registrationNo ?? null, body.address ?? null],
    );

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1, 'clients', $2, 'CreateAssistedClient', $3, now(), $4::jsonb)`,
      [randomUUID(), clientId, actor.userId, JSON.stringify({ businessName: body.businessName, applicantEmail: body.applicantEmail, sendInvite: body.sendInvite })],
    );

    return this.db.queryOne(
      `select id, user_id as "userId", business_name as "businessName", registration_no as "registrationNo", address, created_at as "createdAt" from public.clients where id = $1`,
      [clientId],
    );
  }

  async sendInvite(actor: CurrentUser, clientId: string, body: { applicantEmail: string; applicantFullName?: string; redirectTo?: string }) {
    ensureInternal(actor.roles);

    const client = await this.db.queryOne(`select id from public.clients where id = $1`, [clientId]);
    if (!client) return null;

    const { userId, actionLink } = await this.inviteUserWithLink(body.applicantEmail, body.applicantFullName, body.redirectTo);
    if (userId) {
      await this.db.execute(`update public.clients set user_id = $1 where id = $2`, [userId, clientId]);
      await this.prepareUserProfile(userId, body.applicantEmail, body.applicantFullName);
    }

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1, 'clients', $2, 'SendClientInvite', $3, now(), $4::jsonb)`,
      [randomUUID(), clientId, actor.userId, JSON.stringify({ applicantEmail: body.applicantEmail, redirectTo: body.redirectTo })],
    );

    return { userId, email: body.applicantEmail, status: 'InviteLinkGenerated', actionLink };
  }

  private async prepareUserProfile(userId: string, email: string, fullName?: string) {
    const name = fullName?.trim() || email;
    await this.db.execute(
      `insert into public.profiles (user_id, full_name, phone, created_at) values ($1, $2, null, now()) on conflict (user_id) do update set full_name = excluded.full_name`,
      [userId, name],
    );
    await this.db.execute(
      `insert into public.user_roles (user_id, role_id) select $1, r.id from public.roles r where r.name = 'Client' on conflict (user_id, role_id) do nothing`,
      [userId],
    );
  }

  private async inviteUser(email: string, fullName?: string, redirectTo?: string): Promise<string | null> {
    const result = await this.inviteUserWithLink(email, fullName, redirectTo);
    return result.userId;
  }

  private async inviteUserWithLink(email: string, fullName?: string, redirectTo?: string): Promise<{ userId: string | null; actionLink: string | null }> {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase URL/service role key must be configured for invite flow.');

    const payload: any = { type: 'invite', email, data: { full_name: fullName ?? null } };
    if (redirectTo) payload.redirect_to = redirectTo;

    const response = await axios.post(`${url.replace(/\/$/, '')}/auth/v1/admin/generate_link`, payload, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    });

    const user = response.data?.user;
    const userId = user?.id ?? null;
    const actionLink = response.data?.action_link ?? null;
    return { userId, actionLink };
  }
}
