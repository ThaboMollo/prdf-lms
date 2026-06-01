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
exports.ClientsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
const axios_1 = require("axios");
const crypto_1 = require("crypto");
let ClientsService = class ClientsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async createAssistedClient(actor, body) {
        (0, roles_helper_1.ensureInternal)(actor.roles);
        const clientId = (0, crypto_1.randomUUID)();
        let invitedUserId = null;
        if (body.sendInvite && body.applicantEmail) {
            invitedUserId = await this.inviteUser(body.applicantEmail, body.applicantFullName, body.redirectTo);
            if (invitedUserId) {
                await this.prepareUserProfile(invitedUserId, body.applicantEmail, body.applicantFullName);
            }
        }
        await this.db.execute(`insert into public.clients (id, user_id, business_name, registration_no, address, created_at)
       values ($1, $2, $3, $4, $5, now())`, [clientId, invitedUserId, body.businessName, body.registrationNo ?? null, body.address ?? null]);
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1, 'clients', $2, 'CreateAssistedClient', $3, now(), $4::jsonb)`, [(0, crypto_1.randomUUID)(), clientId, actor.userId, JSON.stringify({ businessName: body.businessName, applicantEmail: body.applicantEmail, sendInvite: body.sendInvite })]);
        return this.db.queryOne(`select id, user_id as "userId", business_name as "businessName", registration_no as "registrationNo", address, created_at as "createdAt" from public.clients where id = $1`, [clientId]);
    }
    async sendInvite(actor, clientId, body) {
        (0, roles_helper_1.ensureInternal)(actor.roles);
        const client = await this.db.queryOne(`select id from public.clients where id = $1`, [clientId]);
        if (!client)
            return null;
        const { userId, actionLink } = await this.inviteUserWithLink(body.applicantEmail, body.applicantFullName, body.redirectTo);
        if (userId) {
            await this.db.execute(`update public.clients set user_id = $1 where id = $2`, [userId, clientId]);
            await this.prepareUserProfile(userId, body.applicantEmail, body.applicantFullName);
        }
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1, 'clients', $2, 'SendClientInvite', $3, now(), $4::jsonb)`, [(0, crypto_1.randomUUID)(), clientId, actor.userId, JSON.stringify({ applicantEmail: body.applicantEmail, redirectTo: body.redirectTo })]);
        return { userId, email: body.applicantEmail, status: 'InviteLinkGenerated', actionLink };
    }
    async prepareUserProfile(userId, email, fullName) {
        const name = fullName?.trim() || email;
        await this.db.execute(`insert into public.profiles (user_id, full_name, phone, created_at) values ($1, $2, null, now()) on conflict (user_id) do update set full_name = excluded.full_name`, [userId, name]);
        await this.db.execute(`insert into public.user_roles (user_id, role_id) select $1, r.id from public.roles r where r.name = 'Client' on conflict (user_id, role_id) do nothing`, [userId]);
    }
    async inviteUser(email, fullName, redirectTo) {
        const result = await this.inviteUserWithLink(email, fullName, redirectTo);
        return result.userId;
    }
    async inviteUserWithLink(email, fullName, redirectTo) {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey)
            throw new Error('Supabase URL/service role key must be configured for invite flow.');
        const payload = { type: 'invite', email, data: { full_name: fullName ?? null } };
        if (redirectTo)
            payload.redirect_to = redirectTo;
        const response = await axios_1.default.post(`${url.replace(/\/$/, '')}/auth/v1/admin/generate_link`, payload, {
            headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
        });
        const user = response.data?.user;
        const userId = user?.id ?? null;
        const actionLink = response.data?.action_link ?? null;
        return { userId, actionLink };
    }
};
exports.ClientsService = ClientsService;
exports.ClientsService = ClientsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ClientsService);
//# sourceMappingURL=clients.service.js.map