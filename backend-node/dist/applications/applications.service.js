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
exports.ApplicationsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
const loan_limits_1 = require("../common/loan-limits");
const interest_1 = require("../common/interest");
const crypto_1 = require("crypto");
const axios_1 = require("axios");
const REQUIRED_DOCUMENT_TYPES = [
    'IDDocument',
    'ProofOfAddress',
    'BusinessRegistration',
    'TaxClearance',
    'BankStatement',
    'Financials',
    'VendorQuotation',
    'RfqSupplierSpec',
    'PurchaseOrder',
    'TradeReference',
];
const LOAN_STATUS_TRANSITIONS = {
    Draft: ['Submitted'],
    Submitted: ['UnderReview', 'InfoRequested', 'Approved', 'Rejected'],
    UnderReview: ['InfoRequested', 'Approved', 'Rejected'],
    InfoRequested: ['Submitted', 'UnderReview'],
    Approved: ['Disbursed'],
    Disbursed: ['InRepayment'],
    InRepayment: ['Closed'],
};
let ApplicationsService = class ApplicationsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getRoles(userId) {
        const rows = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`, [userId]);
        return [...new Set(rows.map((r) => r.name))];
    }
    async getSecurityProjection(applicationId) {
        return this.db.queryOne(`select la.id, la.status, la.assigned_to_user_id, c.user_id as client_owner_user_id
       from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`, [applicationId]);
    }
    ensureCanAccess(roles, userId, proj) {
        if ((0, roles_helper_1.isStaff)(roles))
            return;
        if ((0, roles_helper_1.hasAnyRole)(roles, ...roles_helper_1.ASSIGNED_ROLES) && proj.assigned_to_user_id === userId)
            return;
        if ((0, roles_helper_1.hasRole)(roles, 'Client') && proj.client_owner_user_id === userId)
            return;
        throw new Error('User cannot access this application.');
    }
    ensureWithinLoanLimits(requestedAmount, termMonths) {
        if (!(requestedAmount >= loan_limits_1.LOAN_AMOUNT_MIN && requestedAmount <= loan_limits_1.LOAN_AMOUNT_MAX)) {
            throw new Error('Requested amount must be between R250 000 and R5 000 000.');
        }
        if (!(termMonths >= loan_limits_1.LOAN_TERM_MIN && termMonths <= loan_limits_1.LOAN_TERM_MAX)) {
            throw new Error('Term months must be between 1 and 60.');
        }
    }
    ensureTransitionAllowed(roles, fromStatus, toStatus) {
        if (fromStatus === toStatus)
            return;
        const allowed = LOAN_STATUS_TRANSITIONS[fromStatus] ?? [];
        if (!allowed.includes(toStatus))
            throw new Error(`Invalid status transition: ${fromStatus} -> ${toStatus}.`);
        if (toStatus === 'Submitted')
            return;
        if (!(0, roles_helper_1.isStaff)(roles))
            throw new Error('Only LoanOfficer/Admin can perform this status transition.');
    }
    async getById(applicationId) {
        return this.db.queryOne(`select la.id, la.client_id as "clientId", la.requested_amount as "requestedAmount",
              la.term_months as "termMonths", la.purpose, la.status,
              la.created_at as "createdAt", la.submitted_at as "submittedAt",
              la.assigned_to_user_id as "assignedToUserId",
              l.id as "loanId"
       from public.loan_applications la
       left join public.loans l on l.application_id = la.id
       where la.id = $1`, [applicationId]);
    }
    async insertStatusHistory(applicationId, fromStatus, toStatus, changedBy, note) {
        await this.db.execute(`insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,$4,$5,now(),$6)`, [(0, crypto_1.randomUUID)(), applicationId, fromStatus, toStatus, changedBy, note]);
    }
    async insertAuditLog(applicationId, action, actorUserId, metadata) {
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_applications',$2,$3,$4,now(),$5::jsonb)`, [(0, crypto_1.randomUUID)(), applicationId, action, actorUserId, JSON.stringify(metadata)]);
    }
    async createStatusNotifications(applicationId, toStatus, actorUserId, note) {
        const proj = await this.db.queryOne(`select c.user_id as client_user_id, la.assigned_to_user_id from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`, [applicationId]);
        if (!proj)
            return;
        const targets = [proj.client_user_id, proj.assigned_to_user_id].filter((id) => !!id && id !== actorUserId);
        const unique = [...new Set(targets)];
        for (const targetId of unique) {
            await this.db.execute(`insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at) values ($1,$2,'InApp','ApplicationStatusChanged','Application status updated',$3,'Sent',$4::jsonb,now(),now())`, [(0, crypto_1.randomUUID)(), targetId, `Application status changed to ${toStatus}.`, JSON.stringify({ applicationId, status: toStatus, note })]);
        }
    }
    async ensureLoanCreatedForApproved(applicationId) {
        const exists = await this.db.queryOne(`select exists (select 1 from public.loans where application_id = $1) as exists`, [applicationId]);
        if (exists?.exists)
            return;
        const source = await this.db.queryOne(`select requested_amount, term_months from public.loan_applications where id = $1`, [applicationId]);
        if (!source)
            return;
        await this.db.execute(`insert into public.loans (id, application_id, principal_amount, interest_rate, term_months, status, outstanding_principal, created_at) values ($1,$2,$3,$4,$5,'PendingDisbursement',$3,now())`, [(0, crypto_1.randomUUID)(), applicationId, source.requested_amount, interest_1.DEFAULT_ANNUAL_RATE_PA, source.term_months]);
    }
    async create(actor, body) {
        const roles = await this.getRoles(actor.userId);
        this.ensureWithinLoanLimits(body.requestedAmount, body.termMonths);
        let clientId = body.clientId ?? null;
        const assignedTo = body.assignedToUserId ?? null;
        if ((0, roles_helper_1.hasAnyRole)(roles, ...roles_helper_1.ASSIGNED_ROLES)) {
            if (!assignedTo || assignedTo !== actor.userId)
                throw new Error('Intern/Originator can only create applications assigned to themselves.');
            if (!clientId)
                throw new Error('ClientId is required for intern/originator-created applications.');
        }
        else if ((0, roles_helper_1.hasRole)(roles, 'Client')) {
            if (clientId) {
                const owns = await this.db.queryOne(`select exists (select 1 from public.clients where id = $1 and user_id = $2) as exists`, [clientId, actor.userId]);
                if (!owns?.exists)
                    clientId = null;
            }
            if (!clientId) {
                const existing = await this.db.queryOne(`select id from public.clients where user_id = $1 order by created_at asc limit 1`, [actor.userId]);
                clientId = existing?.id ?? null;
            }
            if (!clientId && body.businessName) {
                clientId = (0, crypto_1.randomUUID)();
                await this.db.execute(`insert into public.clients (id, user_id, business_name, registration_no, address, created_at) values ($1,$2,$3,$4,$5,now())`, [clientId, actor.userId, body.businessName, body.registrationNo ?? null, body.address ?? null]);
            }
            if (!clientId)
                throw new Error('Could not resolve client profile. Provide business info.');
        }
        else if ((0, roles_helper_1.isStaff)(roles)) {
            if (!clientId)
                throw new Error('ClientId is required for staff-created applications.');
        }
        else {
            throw new Error('Role not allowed to create applications.');
        }
        const appId = (0, crypto_1.randomUUID)();
        await this.db.execute(`insert into public.loan_applications (id, client_id, requested_amount, term_months, purpose, status, assigned_to_user_id, created_at) values ($1,$2,$3,$4,$5,'Draft',$6,now())`, [appId, clientId, body.requestedAmount, body.termMonths, body.purpose, assignedTo]);
        await this.insertStatusHistory(appId, null, 'Draft', actor.userId, null);
        await this.insertAuditLog(appId, 'CreateDraftApplication', actor.userId, { clientId, requestedAmount: body.requestedAmount });
        return this.getById(appId);
    }
    async update(actor, applicationId, body) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        if (proj.status !== 'Draft') {
            if (!(0, roles_helper_1.isStaff)(roles))
                throw new Error('Only staff can reassign non-draft applications.');
            await this.db.execute(`update public.loan_applications set assigned_to_user_id = $1 where id = $2`, [body.assignedToUserId ?? null, applicationId]);
            await this.insertAuditLog(applicationId, 'ReassignApplication', actor.userId, { assignedToUserId: body.assignedToUserId });
            return this.getById(applicationId);
        }
        this.ensureWithinLoanLimits(body.requestedAmount, body.termMonths);
        await this.db.execute(`update public.loan_applications set requested_amount=$1, term_months=$2, purpose=$3, assigned_to_user_id=$4 where id=$5`, [body.requestedAmount, body.termMonths, body.purpose, body.assignedToUserId ?? null, applicationId]);
        await this.insertAuditLog(applicationId, 'UpdateDraftApplication', actor.userId, { requestedAmount: body.requestedAmount, termMonths: body.termMonths });
        return this.getById(applicationId);
    }
    async list(actor) {
        const roles = await this.getRoles(actor.userId);
        let sql = `select la.id, la.client_id as "clientId", la.requested_amount as "requestedAmount", la.term_months as "termMonths", la.purpose, la.status, la.created_at as "createdAt", la.submitted_at as "submittedAt", la.assigned_to_user_id as "assignedToUserId" from public.loan_applications la join public.clients c on c.id = la.client_id`;
        let params = [];
        if ((0, roles_helper_1.isStaff)(roles)) {
            sql += ` order by la.created_at desc`;
        }
        else if ((0, roles_helper_1.hasAnyRole)(roles, ...roles_helper_1.ASSIGNED_ROLES)) {
            sql += ` where la.assigned_to_user_id = $1 order by la.created_at desc`;
            params = [actor.userId];
        }
        else if ((0, roles_helper_1.hasRole)(roles, 'Client')) {
            sql += ` where c.user_id = $1 order by la.created_at desc`;
            params = [actor.userId];
        }
        else {
            return [];
        }
        return this.db.query(sql, params);
    }
    async getOne(actor, applicationId) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        return this.getById(applicationId);
    }
    async ensureRequiredDocumentsPresent(applicationId) {
        const rows = await this.db.query(`select distinct doc_type from public.loan_documents where application_id = $1`, [applicationId]);
        const uploaded = new Set(rows.map((r) => r.doc_type));
        const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !uploaded.has(t));
        if (missing.length) {
            throw new Error(`Cannot submit: missing required document(s): ${missing.join(', ')}.`);
        }
    }
    async submit(actor, applicationId, note) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        if (proj.status !== 'Draft')
            throw new Error('Only Draft applications can be submitted.');
        await this.ensureRequiredDocumentsPresent(applicationId);
        await this.db.execute(`update public.loan_applications set status='Submitted', submitted_at=now() where id=$1`, [applicationId]);
        await this.insertStatusHistory(applicationId, 'Draft', 'Submitted', actor.userId, note);
        await this.insertAuditLog(applicationId, 'SubmitApplication', actor.userId, { note });
        await this.createStatusNotifications(applicationId, 'Submitted', actor.userId, note);
        return this.getById(applicationId);
    }
    async changeStatus(actor, applicationId, toStatus, note) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        this.ensureTransitionAllowed(roles, proj.status, toStatus);
        await this.db.execute(`update public.loan_applications set status=$1, submitted_at=case when $1='Submitted' and submitted_at is null then now() else submitted_at end where id=$2`, [toStatus, applicationId]);
        if (toStatus === 'InfoRequested') {
            await this.createInfoRequestedFollowUp(applicationId, note, actor.userId);
        }
        await this.insertStatusHistory(applicationId, proj.status, toStatus, actor.userId, note);
        await this.insertAuditLog(applicationId, 'ChangeApplicationStatus', actor.userId, { fromStatus: proj.status, toStatus, note });
        await this.createStatusNotifications(applicationId, toStatus, actor.userId, note);
        if (toStatus === 'Approved') {
            await this.ensureLoanCreatedForApproved(applicationId);
        }
        return this.getById(applicationId);
    }
    async createInfoRequestedFollowUp(applicationId, note, actorUserId) {
        const proj = await this.db.queryOne(`select c.user_id as client_user_id from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`, [applicationId]);
        const taskTitle = note ? `Info requested from applicant: ${note}` : 'Info requested from applicant';
        await this.db.execute(`insert into public.tasks (id, application_id, title, status, assigned_to, due_date) values ($1,$2,$3,'Open',$4,current_date + 7)`, [(0, crypto_1.randomUUID)(), applicationId, taskTitle, proj?.client_user_id ?? null]);
        const noteBody = note ? `Additional information has been requested. Please review tasks and provide requested documents/details. Note: ${note}` : 'Additional information has been requested. Please review tasks and provide requested documents/details.';
        await this.db.execute(`insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`, [(0, crypto_1.randomUUID)(), applicationId, noteBody, actorUserId]);
    }
    async getHistory(actor, applicationId) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return [];
        this.ensureCanAccess(roles, actor.userId, proj);
        return this.db.query(`select id, application_id as "applicationId", from_status as "fromStatus", to_status as "toStatus", changed_by as "changedBy", changed_at as "changedAt", note from public.application_status_history where application_id=$1 order by changed_at asc`, [applicationId]);
    }
    async listNotes(actor, applicationId) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return [];
        this.ensureCanAccess(roles, actor.userId, proj);
        return this.db.query(`select id, application_id as "applicationId", body, created_by as "createdBy", created_at as "createdAt" from public.notes where application_id=$1 order by created_at asc`, [applicationId]);
    }
    async createNote(actor, applicationId, body) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        const noteId = (0, crypto_1.randomUUID)();
        await this.db.execute(`insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`, [noteId, applicationId, body, actor.userId]);
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'notes',$2,'CreateNote',$3,now(),$4::jsonb)`, [(0, crypto_1.randomUUID)(), noteId, actor.userId, JSON.stringify({ applicationId })]);
        return this.db.queryOne(`select id, application_id as "applicationId", body, created_by as "createdBy", created_at as "createdAt" from public.notes where id=$1`, [noteId]);
    }
    async presignUpload(actor, applicationId, body) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        const safeFileName = body.fileName.replace(/ /g, '-');
        const storagePath = `applications/${applicationId}/${(0, crypto_1.randomUUID)().replace(/-/g, '')}-${safeFileName}`;
        const uploadUrl = await this.createSignedUploadUrl('loan-documents', storagePath);
        return { bucket: 'loan-documents', storagePath, uploadUrl, expiresInSeconds: 7200 };
    }
    async confirmUpload(actor, applicationId, body) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return null;
        this.ensureCanAccess(roles, actor.userId, proj);
        const docId = (0, crypto_1.randomUUID)();
        await this.db.execute(`insert into public.loan_documents (id, application_id, doc_type, storage_path, status, uploaded_by, uploaded_at) values ($1,$2,$3,$4,$5,$6,now())`, [docId, applicationId, body.docType, body.storagePath, body.status || 'Pending', actor.userId]);
        await this.db.execute(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'ConfirmDocumentUpload',$3,now(),$4::jsonb)`, [(0, crypto_1.randomUUID)(), docId, actor.userId, JSON.stringify({ docType: body.docType, storagePath: body.storagePath })]);
        return this.db.queryOne(`select id, application_id as "applicationId", doc_type as "docType", storage_path as "storagePath", status, uploaded_by as "uploadedBy", uploaded_at as "uploadedAt" from public.loan_documents where id=$1`, [docId]);
    }
    async listDocuments(actor, applicationId) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.getSecurityProjection(applicationId);
        if (!proj)
            return [];
        this.ensureCanAccess(roles, actor.userId, proj);
        return this.db.query(`select id, application_id as "applicationId", doc_type as "docType", storage_path as "storagePath", status, uploaded_by as "uploadedBy", uploaded_at as "uploadedAt" from public.loan_documents where application_id=$1 order by uploaded_at desc`, [applicationId]);
    }
    async createSignedUploadUrl(bucket, storagePath) {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey)
            throw new Error('Supabase URL/service role key must be configured for presigned uploads.');
        const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
        const endpoint = `${url.replace(/\/$/, '')}/storage/v1/object/upload/sign/${bucket}/${encodedPath}`;
        const response = await axios_1.default.post(endpoint, {}, {
            headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
        });
        const token = response.data?.token;
        if (!token)
            throw new Error('Supabase response did not include signed upload token.');
        return `${endpoint}?token=${encodeURIComponent(token)}`;
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ApplicationsService);
//# sourceMappingURL=applications.service.js.map