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
exports.LoansService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const roles_helper_1 = require("../auth/roles.helper");
const crypto_1 = require("crypto");
let LoansService = class LoansService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getRoles(userId) {
        const rows = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`, [userId]);
        return [...new Set(rows.map((r) => r.name))];
    }
    async getLoanDetails(loanId) {
        const loan = await this.db.queryOne(`select id, application_id as "applicationId", principal_amount as "principalAmount", outstanding_principal as "outstandingPrincipal", interest_rate as "interestRate", term_months as "termMonths", status, disbursed_at as "disbursedAt", created_at as "createdAt" from public.loans where id=$1`, [loanId]);
        if (!loan)
            return null;
        const schedule = await this.db.query(`select id, installment_no as "installmentNo", due_date as "dueDate", due_principal as "duePrincipal", due_interest as "dueInterest", due_total as "dueTotal", paid_amount as "paidAmount", status, paid_at as "paidAt" from public.repayment_schedule where loan_id=$1 order by installment_no asc`, [loanId]);
        const repayments = await this.db.query(`select id, amount, principal_component as "principalComponent", interest_component as "interestComponent", paid_at as "paidAt", payment_reference as "paymentReference" from public.repayments where loan_id=$1 order by paid_at desc`, [loanId]);
        return { ...loan, schedule, repayments };
    }
    async getById(actor, loanId) {
        const roles = await this.getRoles(actor.userId);
        const proj = await this.db.queryOne(`select l.id as loan_id, c.user_id as client_owner_user_id, la.assigned_to_user_id from public.loans l join public.loan_applications la on la.id=l.application_id join public.clients c on c.id=la.client_id where l.id=$1`, [loanId]);
        if (!proj)
            return null;
        if (!(0, roles_helper_1.isStaff)(roles) && !((0, roles_helper_1.hasAnyRole)(roles, ...roles_helper_1.ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !((0, roles_helper_1.hasRole)(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
            throw new Error('User cannot access this loan.');
        }
        return this.getLoanDetails(loanId);
    }
    async disburse(actor, loanId, body) {
        const roles = await this.getRoles(actor.userId);
        if (!(0, roles_helper_1.isStaff)(roles))
            throw new Error('Only Admin or LoanOfficer can perform this action.');
        await this.db.withTransaction(async (client) => {
            const loanResult = await client.query(`select id, application_id, principal_amount, outstanding_principal, interest_rate, term_months, status from public.loans where id=$1 for update`, [loanId]);
            const loan = loanResult.rows[0];
            if (!loan)
                return null;
            if (loan.status !== 'PendingDisbursement' && loan.status !== 'Disbursed')
                throw new Error(`Loan status ${loan.status} cannot be disbursed.`);
            const amount = Math.min(body.amount, parseFloat(loan.outstanding_principal));
            if (amount <= 0)
                throw new Error('Disbursement amount must be greater than zero.');
            await client.query(`insert into public.disbursements (id, loan_id, amount, disbursed_at, disbursed_by, reference) values ($1,$2,$3,now(),$4,$5)`, [(0, crypto_1.randomUUID)(), loanId, amount, actor.userId, body.reference ?? null]);
            await client.query(`update public.loans set status='Disbursed', disbursed_at=coalesce(disbursed_at,now()) where id=$1`, [loanId]);
            const currentAppStatus = await client.query(`select status from public.loan_applications where id=$1`, [loan.application_id]);
            if (currentAppStatus.rows[0]?.status !== 'Disbursed') {
                await client.query(`update public.loan_applications set status='Disbursed' where id=$1`, [loan.application_id]);
                await client.query(`insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,'Disbursed',$4,now(),$5)`, [(0, crypto_1.randomUUID)(), loan.application_id, currentAppStatus.rows[0]?.status ?? null, actor.userId, 'Loan disbursed.']);
            }
            const schedCount = await client.query(`select count(*) as cnt from public.repayment_schedule where loan_id=$1`, [loanId]);
            if (parseInt(schedCount.rows[0].cnt) === 0) {
                await this.buildRepaymentSchedule(client, loan);
            }
            await client.query(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loans',$2,'DisburseLoan',$3,now(),$4::jsonb)`, [(0, crypto_1.randomUUID)(), loanId, actor.userId, JSON.stringify({ amount, reference: body.reference })]);
        });
        return this.getLoanDetails(loanId);
    }
    async recordRepayment(actor, loanId, body) {
        const roles = await this.getRoles(actor.userId);
        if (!(0, roles_helper_1.isStaff)(roles))
            throw new Error('Only Admin or LoanOfficer can perform this action.');
        await this.db.withTransaction(async (client) => {
            const loanResult = await client.query(`select id, application_id, outstanding_principal, status from public.loans where id=$1 for update`, [loanId]);
            const loan = loanResult.rows[0];
            if (!loan)
                return null;
            if (loan.status === 'Closed')
                throw new Error('Closed loan cannot accept repayments.');
            const outstanding = parseFloat(loan.outstanding_principal);
            const principalComponent = Math.min(body.amount, outstanding);
            const interestComponent = body.amount - principalComponent;
            const newOutstanding = Math.max(0, outstanding - principalComponent);
            const nextStatus = newOutstanding === 0 ? 'Closed' : 'InRepayment';
            const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
            await client.query(`insert into public.repayments (id, loan_id, amount, principal_component, interest_component, paid_at, payment_reference, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [(0, crypto_1.randomUUID)(), loanId, body.amount, principalComponent, interestComponent, paidAt, body.paymentReference ?? null, actor.userId]);
            await client.query(`update public.loans set outstanding_principal=$1, status=$2 where id=$3`, [newOutstanding, nextStatus, loanId]);
            await this.applyRepaymentToSchedule(client, loanId, body.amount, paidAt);
            const appStatus = nextStatus === 'Closed' ? 'Closed' : 'InRepayment';
            const currentAppStatusResult = await client.query(`select status from public.loan_applications where id=$1`, [loan.application_id]);
            if (currentAppStatusResult.rows[0]?.status !== appStatus) {
                await client.query(`update public.loan_applications set status=$1 where id=$2`, [appStatus, loan.application_id]);
                await client.query(`insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,$4,$5,now(),$6)`, [(0, crypto_1.randomUUID)(), loan.application_id, currentAppStatusResult.rows[0]?.status ?? null, appStatus, actor.userId, 'Repayment recorded.']);
            }
            await client.query(`insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'repayments',$2,'RecordRepayment',$3,now(),$4::jsonb)`, [(0, crypto_1.randomUUID)(), loanId, actor.userId, JSON.stringify({ amount: body.amount, principalComponent, interestComponent })]);
        });
        return this.getLoanDetails(loanId);
    }
    async buildRepaymentSchedule(client, loan) {
        const principal = parseFloat(loan.principal_amount);
        const termMonths = parseInt(loan.term_months);
        const interestRate = parseFloat(loan.interest_rate);
        const installmentPrincipal = Math.round((principal / termMonths) * 100) / 100;
        let remainingPrincipal = principal;
        const baseDate = new Date();
        for (let i = 1; i <= termMonths; i++) {
            const p = i === termMonths ? remainingPrincipal : installmentPrincipal;
            remainingPrincipal = Math.round((remainingPrincipal - p) * 100) / 100;
            const interest = Math.round(p * (interestRate / 100) * 100) / 100;
            const total = Math.round((p + interest) * 100) / 100;
            const dueDate = new Date(baseDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            await client.query(`insert into public.repayment_schedule (id, loan_id, installment_no, due_date, due_principal, due_interest, due_total, paid_amount, status) values ($1,$2,$3,$4,$5,$6,$7,0,'Pending')`, [(0, crypto_1.randomUUID)(), loan.id, i, dueDate, Math.round(p * 100) / 100, interest, total]);
        }
    }
    async applyRepaymentToSchedule(client, loanId, paymentAmount, paidAt) {
        let remaining = paymentAmount;
        while (remaining > 0) {
            const next = await client.query(`select id, due_total, paid_amount from public.repayment_schedule where loan_id=$1 and paid_amount < due_total order by installment_no asc limit 1`, [loanId]);
            if (!next.rows[0])
                break;
            const installment = next.rows[0];
            const dueRemaining = parseFloat(installment.due_total) - parseFloat(installment.paid_amount);
            const applied = Math.min(remaining, dueRemaining);
            remaining = Math.round((remaining - applied) * 100) / 100;
            const newPaid = Math.round((parseFloat(installment.paid_amount) + applied) * 100) / 100;
            const newStatus = newPaid >= parseFloat(installment.due_total) ? 'Paid' : 'Pending';
            await client.query(`update public.repayment_schedule set paid_amount=$1, status=$2, paid_at=case when $2='Paid' then $3 else paid_at end where id=$4`, [newPaid, newStatus, paidAt, installment.id]);
        }
    }
};
exports.LoansService = LoansService;
exports.LoansService = LoansService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], LoansService);
//# sourceMappingURL=loans.service.js.map