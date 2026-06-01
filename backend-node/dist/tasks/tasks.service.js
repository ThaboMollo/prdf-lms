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
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
const crypto_1 = require("crypto");
let TasksService = class TasksService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getRoles(userId) {
        const rows = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [userId]);
        return [...new Set(rows.map((r) => r.name))];
    }
    async list(actor, applicationId, assignedToMe) {
        const roles = await this.getRoles(actor.userId);
        let sql = `select t.id, t.application_id as "applicationId", t.title, t.status, t.assigned_to as "assignedTo", t.due_date as "dueDate" from public.tasks t join public.loan_applications la on la.id=t.application_id join public.clients c on c.id=la.client_id where 1=1`;
        const params = [];
        let idx = 1;
        if (applicationId) {
            sql += ` and t.application_id=$${idx++}`;
            params.push(applicationId);
        }
        if (assignedToMe) {
            sql += ` and t.assigned_to=$${idx++}`;
            params.push(actor.userId);
        }
        else if (!(0, roles_helper_1.isStaff)(roles)) {
            sql += ` and (t.assigned_to=$${idx} or c.user_id=$${idx})`;
            params.push(actor.userId);
            idx++;
        }
        sql += ` order by t.due_date asc nulls last, t.title asc`;
        return this.db.query(sql, params);
    }
    async create(actor, body) {
        const roles = await this.getRoles(actor.userId);
        if (!(0, roles_helper_1.hasAnyRole)(roles, 'Admin', 'LoanOfficer', 'Intern', 'Originator'))
            throw new Error('Only internal users can create tasks.');
        const proj = await this.db.queryOne(`select la.id, la.assigned_to_user_id, c.user_id as client_owner_user_id from public.loan_applications la join public.clients c on c.id=la.client_id where la.id=$1`, [body.applicationId]);
        if (!proj)
            throw new Error('Application not found.');
        if (!(0, roles_helper_1.isStaff)(roles) && !((0, roles_helper_1.hasAnyRole)(roles, ...roles_helper_1.ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !((0, roles_helper_1.hasRole)(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
            throw new Error('User cannot access this application.');
        }
        const taskId = (0, crypto_1.randomUUID)();
        await this.db.execute(`insert into public.tasks (id, application_id, title, status, assigned_to, due_date) values ($1,$2,$3,'Open',$4,$5)`, [taskId, body.applicationId, body.title, body.assignedTo ?? null, body.dueDate ? new Date(body.dueDate) : null]);
        if (body.assignedTo && body.assignedTo !== actor.userId) {
            await this.db.execute(`insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at) values ($1,$2,'InApp','TaskAssigned','New task assigned',$3,'Sent',$4::jsonb,now(),now())`, [(0, crypto_1.randomUUID)(), body.assignedTo, body.title, JSON.stringify({ taskId, applicationId: body.applicationId })]);
        }
        return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
    }
    async update(actor, taskId, body) {
        const task = await this.db.queryOne(`select id, application_id, assigned_to from public.tasks where id=$1`, [taskId]);
        if (!task)
            return null;
        const roles = await this.getRoles(actor.userId);
        const proj = await this.db.queryOne(`select la.id, la.assigned_to_user_id, c.user_id as client_owner_user_id from public.loan_applications la join public.clients c on c.id=la.client_id where la.id=$1`, [task.application_id]);
        if (!proj)
            return null;
        if (!(0, roles_helper_1.isStaff)(roles) && task.assigned_to !== actor.userId && !((0, roles_helper_1.hasAnyRole)(roles, ...roles_helper_1.ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !((0, roles_helper_1.hasRole)(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
            throw new Error('User cannot access this application.');
        }
        await this.db.execute(`update public.tasks set title=coalesce($1, title), assigned_to=$2, due_date=$3 where id=$4`, [body.title ?? null, body.assignedTo ?? null, body.dueDate ? new Date(body.dueDate) : null, taskId]);
        return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
    }
    async complete(actor, taskId, note) {
        const task = await this.db.queryOne(`select id, application_id, assigned_to from public.tasks where id=$1`, [taskId]);
        if (!task)
            return null;
        await this.db.execute(`update public.tasks set status='Completed' where id=$1`, [taskId]);
        if (note) {
            await this.db.execute(`insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`, [(0, crypto_1.randomUUID)(), task.application_id, note, actor.userId]);
        }
        return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map