import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(actor: CurrentUser, unreadOnly: boolean) {
    let sql = `select id, user_id as "userId", channel, type, title, message, status, created_at as "createdAt", sent_at as "sentAt", read_at as "readAt", payload::text as payload from public.notifications where user_id=$1`;
    if (unreadOnly) sql += ` and read_at is null`;
    sql += ` order by created_at desc limit 200`;
    return this.db.query(sql, [actor.userId]);
  }

  async markRead(actor: CurrentUser, notificationId: string) {
    await this.db.execute(
      `update public.notifications set read_at=coalesce(read_at,now()), status=case when status='Sent' then 'Read' else status end where id=$1 and user_id=$2`,
      [notificationId, actor.userId],
    );
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'notifications',$2,'MarkNotificationRead',$3,now(),$4::jsonb)`,
      [randomUUID(), notificationId, actor.userId, JSON.stringify({ notificationId })],
    );
  }

  async runReminderScans() {
    await this.db.execute(`
      insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
      select gen_random_uuid(), c.user_id, 'InApp', 'ArrearsReminder', 'Repayment overdue',
             'Your repayment is overdue. Please make payment as soon as possible.',
             'Sent', jsonb_build_object('loanId', l.id, 'applicationId', l.application_id), now(), now()
      from public.repayment_schedule rs
      join public.loans l on l.id=rs.loan_id
      join public.loan_applications la on la.id=l.application_id
      join public.clients c on c.id=la.client_id
      where rs.due_date < current_date and rs.due_total > rs.paid_amount and c.user_id is not null
        and not exists (
          select 1 from public.notifications n
          where n.user_id=c.user_id and n.type='ArrearsReminder'
            and (n.payload->>'loanId')::uuid=l.id and n.created_at::date=current_date
        )`);

    await this.db.execute(`
      insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
      select gen_random_uuid(), t.assigned_to, 'InApp', 'TaskReminder', 'Task reminder',
             'You have an open task due soon.',
             'Sent', jsonb_build_object('taskId', t.id, 'applicationId', t.application_id), now(), now()
      from public.tasks t
      where t.assigned_to is not null and t.status='Open' and t.due_date is not null and t.due_date <= current_date + 1
        and not exists (
          select 1 from public.notifications n
          where n.user_id=t.assigned_to and n.type='TaskReminder'
            and (n.payload->>'taskId')::uuid=t.id and n.created_at::date=current_date
        )`);

    await this.db.execute(`
      insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
      select gen_random_uuid(), coalesce(la.assigned_to_user_id, c.user_id), 'InApp', 'StaleApplicationFollowUp',
             'Application follow-up', 'This application has been pending follow-up for over 7 days.',
             'Sent', jsonb_build_object('applicationId', la.id, 'status', la.status), now(), now()
      from public.loan_applications la join public.clients c on c.id=la.client_id
      where la.status in ('Submitted','UnderReview','InfoRequested')
        and la.created_at < now() - interval '7 days'
        and coalesce(la.assigned_to_user_id, c.user_id) is not null
        and not exists (
          select 1 from public.notifications n
          where n.user_id=coalesce(la.assigned_to_user_id, c.user_id)
            and n.type='StaleApplicationFollowUp'
            and (n.payload->>'applicationId')::uuid=la.id
            and n.created_at::date=current_date
        )`);
  }
}
