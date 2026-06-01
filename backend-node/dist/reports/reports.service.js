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
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
let ReportsService = class ReportsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async ensureStaff(actor) {
        const roles = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [actor.userId]);
        if (!(0, roles_helper_1.isStaff)(roles.map((r) => r.name)))
            throw new Error('Only Admin or LoanOfficer can access reports.');
    }
    async portfolio(actor) {
        await this.ensureStaff(actor);
        return this.db.queryOne(`select cast(count(*) as int) as "totalLoans", cast(count(*) filter (where status in ('Disbursed','InRepayment')) as int) as "activeLoans", coalesce(sum(principal_amount),0) as "totalPrincipal", coalesce(sum(outstanding_principal),0) as "outstandingPrincipal" from public.loans`);
    }
    async arrears(actor) {
        await this.ensureStaff(actor);
        return this.db.query(`select rs.loan_id as "loanId", l.application_id as "applicationId", rs.installment_no as "installmentNo", rs.due_date as "dueDate", rs.due_total as "dueTotal", rs.paid_amount as "paidAmount", cast(greatest(rs.due_total-rs.paid_amount,0) as numeric(18,2)) as "outstandingAmount", cast(greatest((current_date-rs.due_date),0) as int) as "daysOverdue" from public.repayment_schedule rs join public.loans l on l.id=rs.loan_id where rs.due_date<current_date and rs.due_total>rs.paid_amount and l.status<>'Closed' order by rs.due_date asc`);
    }
    async audit(actor, from, to, limit = 200) {
        await this.ensureStaff(actor);
        return this.db.query(`select id, entity, entity_id as "entityId", action, actor_user_id as "actorUserId", at, metadata::text as metadata from public.audit_log where ($1::timestamptz is null or at>=$1::timestamptz) and ($2::timestamptz is null or at<=$2::timestamptz) order by at desc limit $3`, [from ?? null, to ?? null, limit]);
    }
    async turnaround(actor) {
        await this.ensureStaff(actor);
        return this.db.queryOne(`with submitted as (select application_id, min(changed_at) as submitted_at from public.application_status_history where to_status='Submitted' group by application_id), approved as (select application_id, min(changed_at) as approved_at from public.application_status_history where to_status='Approved' group by application_id) select cast(count(*) as int) as count, cast(coalesce(avg(extract(epoch from (a.approved_at-s.submitted_at))/86400.0),0) as double precision) as "averageDays" from submitted s join approved a on a.application_id=s.application_id where a.approved_at>=s.submitted_at`);
    }
    async pipelineConversion(actor) {
        await this.ensureStaff(actor);
        return this.db.query(`select from_status as "fromStatus", to_status as "toStatus", cast(count(*) as int) as count from public.application_status_history group by from_status, to_status order by count(*) desc`);
    }
    async productivity(actor) {
        await this.ensureStaff(actor);
        return this.db.query(`with task_stats as (select coalesce(assigned_to, changed_by) as user_id, cast(count(*) filter (where status='Completed') as int) as tasks_completed from public.tasks t left join public.application_status_history h on h.application_id=t.application_id group by coalesce(assigned_to, changed_by)), app_stats as (select assigned_to_user_id as user_id, cast(count(*) as int) as applications_handled from public.loan_applications where assigned_to_user_id is not null group by assigned_to_user_id) select coalesce(t.user_id, a.user_id) as "userId", coalesce(t.tasks_completed,0) as "tasksCompleted", coalesce(a.applications_handled,0) as "applicationsHandled" from task_stats t full join app_stats a on a.user_id=t.user_id where coalesce(t.user_id,a.user_id) is not null order by coalesce(t.tasks_completed,0) desc`);
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map