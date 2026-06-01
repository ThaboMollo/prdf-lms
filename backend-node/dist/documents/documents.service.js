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
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
const crypto_1 = require("crypto");
let DocumentsService = class DocumentsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getRoles(userId) {
        const rows = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [userId]);
        return [...new Set(rows.map((r) => r.name))];
    }
    async listRequirements(actor) {
        const roles = await this.getRoles(actor.userId);
        if (!(0, roles_helper_1.isStaff)(roles))
            throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
        return this.db.query(`select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", created_at as "createdAt" from public.document_requirements order by required_at_status asc, doc_type asc`);
    }
    async createRequirement(actor, body) {
        const roles = await this.getRoles(actor.userId);
        if (!(0, roles_helper_1.isStaff)(roles))
            throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
        const id = (0, crypto_1.randomUUID)();
        await this.db.execute(`insert into public.document_requirements (id, loan_product_id, required_at_status, doc_type, is_required, created_at) values ($1,$2,$3,$4,$5,now())`, [id, body.loanProductId ?? null, body.requiredAtStatus, body.docType, body.isRequired]);
        return this.db.queryOne(`select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", created_at as "createdAt" from public.document_requirements where id=$1`, [id]);
    }
    async verifyDocument(actor, applicationId, documentId, status, note) {
        const roles = await this.getRoles(actor.userId);
        if (!(0, roles_helper_1.isStaff)(roles))
            throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
        const affected = await this.db.execute(`update public.loan_documents set status=$1, verification_note=$2, verified_by=$3, verified_at=now() where id=$4 and application_id=$5`, [status, note ?? null, actor.userId, documentId, applicationId]);
        if (affected === 0)
            throw new Error('Document not found for application.');
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'VerifyDocument',$3,now(),$4::jsonb)`, [(0, crypto_1.randomUUID)(), documentId, actor.userId, JSON.stringify({ status, note })]);
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map