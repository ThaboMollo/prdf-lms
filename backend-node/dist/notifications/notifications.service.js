"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const crypto_1 = require("crypto");
let NotificationsService = class NotificationsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(actor, unreadOnly) {
        let sql = `select id, user_id as "userId", channel, type, title, message, status, created_at as "createdAt", sent_at as "sentAt", read_at as "readAt", payload::text as payload from public.notifications where user_id=$1`;
        if (unreadOnly)
            sql += ` and read_at is null`;
        sql += ` order by created_at desc limit 200`;
        return this.db.query(sql, [actor.userId]);
    }
    async markRead(actor, notificationId) {
        await this.db.execute(`update public.notifications set read_at=coalesce(read_at,now()), status=case when status='Sent' then 'Read' else status end where id=$1 and user_id=$2`, [notificationId, actor.userId]);
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'notifications',$2,'MarkNotificationRead',$3,now(),$4::jsonb)`, [(0, crypto_1.randomUUID)(), notificationId, actor.userId, JSON.stringify({ notificationId })]);
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
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map