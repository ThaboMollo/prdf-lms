import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, fetchUserRoles, ensureInternal } from '../auth/roles.helper';
import { randomUUID } from 'crypto';
import { CreateNfsDto } from './dto/create-nfs.dto';

@Injectable()
export class NfsService {
  constructor(private readonly db: DatabaseService) {}

  async list(actor: CurrentUser, clientId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    ensureInternal(roles);
    return this.db.query(
      `select id, client_id as "clientId", application_id as "applicationId", advisor_user_id as "advisorUserId",
              support_type as "supportType", duration_hours::float8 as "durationHours", date_provided as "dateProvided",
              notes, created_at as "createdAt"
       from public.non_financial_support
       where client_id = $1
       order by date_provided desc, created_at desc`,
      [clientId],
    );
  }

  async create(actor: CurrentUser, clientId: string, body: CreateNfsDto) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    ensureInternal(roles);

    const id = randomUUID();
    await this.db.execute(
      `insert into public.non_financial_support
         (id, client_id, application_id, advisor_user_id, support_type, duration_hours, date_provided, notes, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [id, clientId, body.applicationId ?? null, actor.userId, body.supportType, body.durationHours, body.dateProvided, body.notes ?? null],
    );

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata)
       values ($1, 'non_financial_support', $2, 'CreateNfsRecord', $3, now(), $4::jsonb)`,
      [randomUUID(), id, actor.userId, JSON.stringify({ clientId, supportType: body.supportType })],
    );

    return this.db.queryOne(
      `select id, client_id as "clientId", application_id as "applicationId", advisor_user_id as "advisorUserId",
              support_type as "supportType", duration_hours::float8 as "durationHours", date_provided as "dateProvided",
              notes, created_at as "createdAt"
       from public.non_financial_support where id = $1`,
      [id],
    );
  }
}
