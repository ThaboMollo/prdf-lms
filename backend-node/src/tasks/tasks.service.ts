import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, isStaff, hasAnyRole, hasRole, ASSIGNED_ROLES } from '../auth/roles.helper';
import { randomUUID } from 'crypto';

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  private async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [userId]);
    return [...new Set(rows.map((r) => r.name))];
  }

  async list(actor: CurrentUser, applicationId?: string, assignedToMe?: boolean) {
    const roles = await this.getRoles(actor.userId);
    let sql = `select t.id, t.application_id as "applicationId", t.title, t.status, t.assigned_to as "assignedTo", t.due_date as "dueDate" from public.tasks t join public.loan_applications la on la.id=t.application_id join public.clients c on c.id=la.client_id where 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (applicationId) { sql += ` and t.application_id=$${idx++}`; params.push(applicationId); }

    if (assignedToMe) {
      sql += ` and t.assigned_to=$${idx++}`; params.push(actor.userId);
    } else if (!isStaff(roles)) {
      sql += ` and (t.assigned_to=$${idx} or c.user_id=$${idx})`; params.push(actor.userId); idx++;
    }

    sql += ` order by t.due_date asc nulls last, t.title asc`;
    return this.db.query(sql, params);
  }

  async create(actor: CurrentUser, body: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }) {
    const roles = await this.getRoles(actor.userId);
    if (!hasAnyRole(roles, 'Admin', 'LoanOfficer', 'Intern', 'Originator')) throw new Error('Only internal users can create tasks.');

    const proj = await this.db.queryOne<{ id: string; assigned_to_user_id: string | null; client_owner_user_id: string | null }>(
      `select la.id, la.assigned_to_user_id, c.user_id as client_owner_user_id from public.loan_applications la join public.clients c on c.id=la.client_id where la.id=$1`,
      [body.applicationId],
    );
    if (!proj) throw new Error('Application not found.');
    if (!isStaff(roles) && !(hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !(hasRole(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
      throw new Error('User cannot access this application.');
    }

    const taskId = randomUUID();
    await this.db.execute(
      `insert into public.tasks (id, application_id, title, status, assigned_to, due_date) values ($1,$2,$3,'Open',$4,$5)`,
      [taskId, body.applicationId, body.title, body.assignedTo ?? null, body.dueDate ? new Date(body.dueDate) : null],
    );

    if (body.assignedTo && body.assignedTo !== actor.userId) {
      await this.db.execute(
        `insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at) values ($1,$2,'InApp','TaskAssigned','New task assigned',$3,'Sent',$4::jsonb,now(),now())`,
        [randomUUID(), body.assignedTo, body.title, JSON.stringify({ taskId, applicationId: body.applicationId })],
      );
    }

    return this.db.queryOne(
      `select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`,
      [taskId],
    );
  }

  async update(actor: CurrentUser, taskId: string, body: { title?: string; assignedTo?: string; dueDate?: string }) {
    const task = await this.db.queryOne<{ id: string; application_id: string; assigned_to: string | null }>(
      `select id, application_id, assigned_to from public.tasks where id=$1`, [taskId],
    );
    if (!task) return null;
    const roles = await this.getRoles(actor.userId);
    const proj = await this.db.queryOne<{ id: string; assigned_to_user_id: string | null; client_owner_user_id: string | null }>(
      `select la.id, la.assigned_to_user_id, c.user_id as client_owner_user_id from public.loan_applications la join public.clients c on c.id=la.client_id where la.id=$1`,
      [task.application_id],
    );
    if (!proj) return null;
    if (!isStaff(roles) && task.assigned_to !== actor.userId && !(hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !(hasRole(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
      throw new Error('User cannot access this application.');
    }
    await this.db.execute(
      `update public.tasks set title=coalesce($1, title), assigned_to=$2, due_date=$3 where id=$4`,
      [body.title ?? null, body.assignedTo ?? null, body.dueDate ? new Date(body.dueDate) : null, taskId],
    );
    return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
  }

  async complete(actor: CurrentUser, taskId: string, note?: string) {
    const task = await this.db.queryOne<{ id: string; application_id: string; assigned_to: string | null }>(
      `select id, application_id, assigned_to from public.tasks where id=$1`, [taskId],
    );
    if (!task) return null;
    await this.db.execute(`update public.tasks set status='Completed' where id=$1`, [taskId]);
    if (note) {
      await this.db.execute(
        `insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`,
        [randomUUID(), task.application_id, note, actor.userId],
      );
    }
    return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
  }
}
