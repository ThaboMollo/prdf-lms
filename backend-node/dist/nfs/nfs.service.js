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
exports.NfsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
const crypto_1 = require("crypto");
const INTERNAL_ROLES = ['Admin', 'LoanOfficer', 'Intern', 'Originator'];
let NfsService = class NfsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getRoles(userId) {
        const rows = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`, [userId]);
        return [...new Set(rows.map((r) => r.name))];
    }
    ensureInternal(roles) {
        if (!(0, roles_helper_1.hasAnyRole)(roles, ...INTERNAL_ROLES))
            throw new Error('Only internal users can access NFS records.');
    }
    async list(actor, clientId) {
        const roles = await this.getRoles(actor.userId);
        this.ensureInternal(roles);
        return this.db.query(`select id, client_id as "clientId", application_id as "applicationId", advisor_user_id as "advisorUserId",
              support_type as "supportType", duration_hours as "durationHours", date_provided as "dateProvided",
              notes, created_at as "createdAt"
       from public.non_financial_support
       where client_id = $1
       order by date_provided desc, created_at desc`, [clientId]);
    }
    async create(actor, clientId, body) {
        const roles = await this.getRoles(actor.userId);
        this.ensureInternal(roles);
        const id = (0, crypto_1.randomUUID)();
        await this.db.execute(`insert into public.non_financial_support
         (id, client_id, application_id, advisor_user_id, support_type, duration_hours, date_provided, notes, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())`, [id, clientId, body.applicationId ?? null, actor.userId, body.supportType, body.durationHours, body.dateProvided, body.notes ?? null]);
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata)
       values ($1, 'non_financial_support', $2, 'CreateNfsRecord', $3, now(), $4::jsonb)`, [(0, crypto_1.randomUUID)(), id, actor.userId, JSON.stringify({ clientId, supportType: body.supportType })]);
        return this.db.queryOne(`select id, client_id as "clientId", application_id as "applicationId", advisor_user_id as "advisorUserId",
              support_type as "supportType", duration_hours as "durationHours", date_provided as "dateProvided",
              notes, created_at as "createdAt"
       from public.non_financial_support where id = $1`, [id]);
    }
};
exports.NfsService = NfsService;
exports.NfsService = NfsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], NfsService);
//# sourceMappingURL=nfs.service.js.map