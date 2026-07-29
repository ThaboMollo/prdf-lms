import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, fetchUserRoles, hasRole, hasAnyRole, isStaff, ASSIGNED_ROLES } from '../auth/roles.helper';
import { LoanProductsService, LoanProduct } from '../loan-products/loan-products.service';
import { DEFAULT_ANNUAL_RATE_PA } from '../common/interest';
import { validateDocumentUpload, assertStoragePathWithinApplication } from '../common/file-validation';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { RecordConsentDto } from './dto/record-consent.dto';
import { randomUUID } from 'crypto';
import axios from 'axios';

const LOAN_STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Submitted'],
  Submitted: ['UnderReview', 'InfoRequested', 'Approved', 'Rejected'],
  UnderReview: ['InfoRequested', 'Approved', 'Rejected'],
  InfoRequested: ['Submitted', 'UnderReview'],
  Approved: ['Disbursed'],
  Disbursed: ['InRepayment'],
  InRepayment: ['Closed'],
};

interface SecurityProjection {
  id: string;
  status: string;
  clientId: string;
  assignedToUserId: string | null;
  clientOwnerUserId: string | null;
  loanProductId: string | null;
  requestedAmount: number;
  termMonths: number;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly loanProducts: LoanProductsService,
  ) {}

  private async getSecurityProjection(applicationId: string): Promise<SecurityProjection | null> {
    return this.db.queryOne<SecurityProjection>(
      `select la.id, la.status, la.client_id as "clientId", la.assigned_to_user_id as "assignedToUserId", c.user_id as "clientOwnerUserId",
              la.loan_product_id as "loanProductId", la.requested_amount as "requestedAmount", la.term_months as "termMonths"
       from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
  }

  /**
   * Mirrors client-ui's resolveClientId() patch semantics exactly: only
   * writes fields the caller actually provided (skips undefined AND empty
   * string — province/spatialType have CHECK constraints on allowed values,
   * and an early draft save before the business profile is filled must not
   * clobber existing client data with blanks).
   */
  private async patchClientProfile(clientId: string, body: CreateApplicationDto) {
    const sets: string[] = [];
    const params: unknown[] = [];
    const setIf = (column: string, value: unknown) => {
      if (value === undefined || value === '') return;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    setIf('registration_no', body.registrationNo);
    setIf('address', body.address);
    if (body.businessName?.trim()) {
      params.push(body.businessName.trim());
      sets.push(`business_name = $${params.length}`);
    }
    setIf('province', body.province);
    setIf('spatial_type', body.spatialType);
    setIf('industry', body.industry);
    setIf('gender', body.gender);
    setIf('is_disabled', body.isDisabled);
    setIf('is_hdp', body.isHdp);
    setIf('is_rural', body.isRural);
    setIf('is_black_women_owned', body.isBlackWomenOwned);
    setIf('sa_citizenship_percentage', body.saCitizenshipPercentage);
    setIf('is_director_operational', body.isDirectorOperational);
    setIf('cipc_registered', body.cipcRegistered);
    setIf('sars_tax_pin', body.sarsTaxPin);
    setIf('insolvent_or_debt_review', body.insolventOrDebtReview);
    if (!sets.length) return;
    params.push(clientId);
    await this.db.execute(`update public.clients set ${sets.join(', ')} where id = $${params.length}`, params);
  }

  private ensureCanAccess(roles: string[], userId: string, proj: { assignedToUserId: string | null; clientOwnerUserId: string | null }) {
    if (isStaff(roles)) return;
    if (hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assignedToUserId === userId) return;
    if (hasRole(roles, 'Client') && proj.clientOwnerUserId === userId) return;
    throw new Error('User cannot access this application.');
  }

  /**
   * Mirrors validate_loan_application_against_product() exactly: fails open
   * if the product has no configured limits (shouldn't happen once every
   * application has a loan_product_id, but the DB trigger fails open rather
   * than assume a specific limit, so this does too).
   */
  private ensureWithinLoanLimits(requestedAmount: number, termMonths: number, product: LoanProduct | null) {
    if (!product || product.minAmount == null || product.maxAmount == null || product.minTermMonths == null || product.maxTermMonths == null) {
      return;
    }
    if (!(requestedAmount >= product.minAmount && requestedAmount <= product.maxAmount)) {
      throw new Error(`Requested amount must be between ${product.minAmount} and ${product.maxAmount}.`);
    }
    if (!(termMonths >= product.minTermMonths && termMonths <= product.maxTermMonths)) {
      throw new Error(`Term months must be between ${product.minTermMonths} and ${product.maxTermMonths}.`);
    }
  }

  private ensureTransitionAllowed(roles: string[], fromStatus: string, toStatus: string) {
    if (fromStatus === toStatus) return;
    const allowed = LOAN_STATUS_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) throw new Error(`Invalid status transition: ${fromStatus} -> ${toStatus}.`);
    if (toStatus === 'Submitted') return;
    if (!isStaff(roles)) throw new Error('Only LoanOfficer/Admin can perform this status transition.');
  }

  private async getById(applicationId: string) {
    return this.db.queryOne(
      `select la.id, la.client_id as "clientId", la.requested_amount as "requestedAmount",
              la.term_months as "termMonths", la.purpose, la.status,
              la.created_at as "createdAt", la.submitted_at as "submittedAt",
              la.assigned_to_user_id as "assignedToUserId", la.loan_product_id as "loanProductId",
              la.monthly_revenue as "monthlyRevenue", la.years_in_operation as "yearsInOperation",
              la.number_of_employees as "numberOfEmployees", la.bank_name as "bankName",
              la.current_step as "currentStep", la.draft_state as "draftState", la.last_saved_at as "lastSavedAt",
              l.id as "loanId"
       from public.loan_applications la
       left join public.loans l on l.application_id = la.id
       where la.id = $1`,
      [applicationId],
    );
  }

  private async insertStatusHistory(applicationId: string, fromStatus: string | null, toStatus: string, changedBy: string, note: string | null) {
    await this.db.execute(
      `insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,$4,$5,now(),$6)`,
      [randomUUID(), applicationId, fromStatus, toStatus, changedBy, note],
    );
  }

  private async insertAuditLog(applicationId: string, action: string, actorUserId: string, metadata: object) {
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_applications',$2,$3,$4,now(),$5::jsonb)`,
      [randomUUID(), applicationId, action, actorUserId, JSON.stringify(metadata)],
    );
  }

  private async createStatusNotifications(applicationId: string, toStatus: string, actorUserId: string, note: string | null) {
    const proj = await this.db.queryOne<{ client_user_id: string | null; assigned_to_user_id: string | null }>(
      `select c.user_id as client_user_id, la.assigned_to_user_id from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
    if (!proj) return;
    const targets = [proj.client_user_id, proj.assigned_to_user_id].filter((id): id is string => !!id && id !== actorUserId);
    const unique = [...new Set(targets)];
    for (const targetId of unique) {
      await this.db.execute(
        `insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at) values ($1,$2,'InApp','ApplicationStatusChanged','Application status updated',$3,'Sent',$4::jsonb,now(),now())`,
        [randomUUID(), targetId, `Application status changed to ${toStatus}.`, JSON.stringify({ applicationId, status: toStatus, note })],
      );
    }
  }

  private async ensureLoanCreatedForApproved(applicationId: string) {
    const exists = await this.db.queryOne<{ exists: boolean }>(
      `select exists (select 1 from public.loans where application_id = $1) as exists`,
      [applicationId],
    );
    if (exists?.exists) return;

    const source = await this.db.queryOne<{ requested_amount: number; term_months: number; loan_product_id: string | null }>(
      `select requested_amount, term_months, loan_product_id from public.loan_applications where id = $1`,
      [applicationId],
    );
    if (!source) return;

    let interestRate = DEFAULT_ANNUAL_RATE_PA;
    if (source.loan_product_id) {
      const product = await this.loanProducts.getById(source.loan_product_id).catch(() => null);
      if (product?.interestRate != null) interestRate = product.interestRate;
    }

    await this.db.execute(
      `insert into public.loans (id, application_id, principal_amount, interest_rate, term_months, status, outstanding_principal, created_at) values ($1,$2,$3,$4,$5,'PendingDisbursement',$3,now())`,
      [randomUUID(), applicationId, source.requested_amount, interestRate, source.term_months],
    );
  }

  async create(actor: CurrentUser, body: CreateApplicationDto) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    let clientId = body.clientId ?? null;
    const assignedTo = body.assignedToUserId ?? null;

    if (hasAnyRole(roles, ...ASSIGNED_ROLES)) {
      if (!assignedTo || assignedTo !== actor.userId) throw new Error('Intern/Originator can only create applications assigned to themselves.');
      if (!clientId) throw new Error('ClientId is required for intern/originator-created applications.');
    } else if (hasRole(roles, 'Client')) {
      if (clientId) {
        const owns = await this.db.queryOne<{ exists: boolean }>(
          `select exists (select 1 from public.clients where id = $1 and user_id = $2) as exists`,
          [clientId, actor.userId],
        );
        if (!owns?.exists) clientId = null;
      }
      if (!clientId) {
        const existing = await this.db.queryOne<{ id: string }>(`select id from public.clients where user_id = $1 order by created_at asc limit 1`, [actor.userId]);
        clientId = existing?.id ?? null;
      }
      if (!clientId && body.businessName) {
        clientId = randomUUID();
        await this.db.execute(
          `insert into public.clients (id, user_id, business_name, registration_no, address, created_at) values ($1,$2,$3,$4,$5,now())`,
          [clientId, actor.userId, body.businessName, body.registrationNo ?? null, body.address ?? null],
        );
      }
      if (!clientId) throw new Error('Could not resolve client profile. Provide business info.');
    } else if (isStaff(roles)) {
      if (!clientId) throw new Error('ClientId is required for staff-created applications.');
    } else {
      throw new Error('Role not allowed to create applications.');
    }

    await this.patchClientProfile(clientId, body);

    const product = await this.loanProducts.getActiveProduct();
    if (!product) throw new Error('No active loan product is configured.');

    const appId = randomUUID();
    await this.db.execute(
      `insert into public.loan_applications
         (id, client_id, requested_amount, term_months, purpose, status, assigned_to_user_id, loan_product_id,
          monthly_revenue, years_in_operation, number_of_employees, bank_name, current_step, draft_state, last_saved_at, created_at)
       values ($1,$2,$3,$4,$5,'Draft',$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now(),now())`,
      [
        appId, clientId, body.requestedAmount ?? 0, body.termMonths ?? 0, body.purpose ?? '', assignedTo, product.id,
        body.monthlyRevenue ?? null, body.yearsInOperation ?? null, body.numberOfEmployees ?? null, body.bankName ?? null,
        body.currentStep ?? 1, body.draftState != null ? JSON.stringify(body.draftState) : null,
      ],
    );
    await this.insertStatusHistory(appId, null, 'Draft', actor.userId, null);
    await this.insertAuditLog(appId, 'CreateDraftApplication', actor.userId, { clientId, requestedAmount: body.requestedAmount });
    return this.getById(appId);
  }

  async update(actor: CurrentUser, applicationId: string, body: UpdateApplicationDto) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);

    if (proj.status !== 'Draft') {
      if (!isStaff(roles)) throw new Error('Only staff can reassign non-draft applications.');
      await this.db.execute(`update public.loan_applications set assigned_to_user_id = $1 where id = $2`, [body.assignedToUserId ?? null, applicationId]);
      await this.insertAuditLog(applicationId, 'ReassignApplication', actor.userId, { assignedToUserId: body.assignedToUserId });
      return this.getById(applicationId);
    }

    // Draft: partial patch, matching client-ui's updateDraftFull()/wizard
    // autosave semantics. No amount/term validation here — the DB trigger
    // itself exempts Draft-status rows (validation happens once, at the
    // Draft -> Submitted transition in submit() below), so autosaving
    // partial/incomplete data mid-wizard never fails.
    const sets: string[] = [];
    const params: unknown[] = [];
    const setIf = (column: string, value: unknown) => {
      if (value !== undefined) {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
    };
    setIf('requested_amount', body.requestedAmount);
    setIf('term_months', body.termMonths);
    setIf('purpose', body.purpose);
    setIf('assigned_to_user_id', body.assignedToUserId);
    setIf('monthly_revenue', body.monthlyRevenue);
    setIf('years_in_operation', body.yearsInOperation);
    setIf('number_of_employees', body.numberOfEmployees);
    setIf('bank_name', body.bankName);
    setIf('current_step', body.currentStep);
    if (body.draftState !== undefined) {
      params.push(JSON.stringify(body.draftState));
      sets.push(`draft_state = $${params.length}::jsonb`);
    }
    sets.push('last_saved_at = now()');
    params.push(applicationId);

    await this.db.execute(`update public.loan_applications set ${sets.join(', ')} where id = $${params.length}`, params);
    await this.patchClientProfile(proj.clientId, body);
    await this.insertAuditLog(applicationId, 'UpdateDraftApplication', actor.userId, { requestedAmount: body.requestedAmount, termMonths: body.termMonths });
    return this.getById(applicationId);
  }

  async list(actor: CurrentUser) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    let sql = `select la.id, la.client_id as "clientId", la.requested_amount as "requestedAmount", la.term_months as "termMonths", la.purpose, la.status, la.created_at as "createdAt", la.submitted_at as "submittedAt", la.assigned_to_user_id as "assignedToUserId" from public.loan_applications la join public.clients c on c.id = la.client_id`;
    let params: any[] = [];

    if (isStaff(roles)) {
      sql += ` order by la.created_at desc`;
    } else if (hasAnyRole(roles, ...ASSIGNED_ROLES)) {
      sql += ` where la.assigned_to_user_id = $1 order by la.created_at desc`;
      params = [actor.userId];
    } else if (hasRole(roles, 'Client')) {
      sql += ` where c.user_id = $1 order by la.created_at desc`;
      params = [actor.userId];
    } else {
      return [];
    }
    return this.db.query(sql, params);
  }

  async getOne(actor: CurrentUser, applicationId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.getById(applicationId);
  }

  async getMyDraft(actor: CurrentUser) {
    const clientRow = await this.db.queryOne<{ id: string }>(`select id from public.clients where user_id = $1`, [actor.userId]);
    if (!clientRow) return null;
    const draft = await this.db.queryOne<{ id: string }>(
      `select id from public.loan_applications where client_id = $1 and status = 'Draft' order by created_at desc limit 1`,
      [clientRow.id],
    );
    if (!draft) return null;
    return this.getById(draft.id);
  }

  /**
   * Only the owning Client, only while Draft — an exact mirror of the
   * "applications delete own draft" RLS policy, which has no staff
   * exception at all (unlike ensureCanAccess, which is deliberately
   * permissive for read/general-access purposes and would be wrong here).
   */
  async deleteApplication(actor: CurrentUser, applicationId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return;
    if (!(hasRole(roles, 'Client') && proj.clientOwnerUserId === actor.userId)) {
      throw new Error('Only the applicant can delete their own draft application.');
    }
    if (proj.status !== 'Draft') throw new Error('Only Draft applications can be deleted.');
    const affected = await this.db.execute(`delete from public.loan_applications where id = $1`, [applicationId]);
    if (affected === 0) throw new Error('Application was not deleted.');
    await this.insertAuditLog(applicationId, 'DeleteDraftApplication', actor.userId, {});
  }

  async recordConsent(actor: CurrentUser, applicationId: string, body: RecordConsentDto) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return;
    this.ensureCanAccess(roles, actor.userId, proj);
    await this.db.execute(
      `insert into public.application_consents (id, application_id, consent_version, items, acknowledged_by, acknowledged_at) values ($1,$2,$3,$4::jsonb,$5,now())`,
      [randomUUID(), applicationId, body.version, JSON.stringify(body.items), actor.userId],
    );
  }

  private async ensureRequiredDocumentsPresent(applicationId: string, loanProductId: string | null) {
    const rows = await this.db.query<{ doc_type: string }>(
      `select dr.doc_type
       from public.document_requirements dr
       where dr.loan_product_id = $1 and dr.required_at_status = 'Submitted' and dr.is_required = true
         and not exists (
           select 1 from public.loan_documents d where d.application_id = $2 and d.doc_type = dr.doc_type
         )`,
      [loanProductId, applicationId],
    );
    if (rows.length) {
      throw new Error(`Cannot submit: missing required document(s): ${rows.map((r) => r.doc_type).join(', ')}.`);
    }
  }

  async submit(actor: CurrentUser, applicationId: string, note: string | null) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    if (proj.status !== 'Draft') throw new Error('Only Draft applications can be submitted.');

    const product = proj.loanProductId ? await this.loanProducts.getById(proj.loanProductId).catch(() => null) : null;
    this.ensureWithinLoanLimits(proj.requestedAmount, proj.termMonths, product);
    await this.ensureRequiredDocumentsPresent(applicationId, proj.loanProductId);

    await this.db.execute(`update public.loan_applications set status='Submitted', submitted_at=now() where id=$1`, [applicationId]);
    await this.insertStatusHistory(applicationId, 'Draft', 'Submitted', actor.userId, note);
    await this.insertAuditLog(applicationId, 'SubmitApplication', actor.userId, { note });
    await this.createStatusNotifications(applicationId, 'Submitted', actor.userId, note);
    return this.getById(applicationId);
  }

  async changeStatus(actor: CurrentUser, applicationId: string, toStatus: string, note: string | null) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    this.ensureTransitionAllowed(roles, proj.status, toStatus);

    await this.db.execute(
      `update public.loan_applications set status=$1, submitted_at=case when $1='Submitted' and submitted_at is null then now() else submitted_at end where id=$2`,
      [toStatus, applicationId],
    );

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

  private async createInfoRequestedFollowUp(applicationId: string, note: string | null, actorUserId: string) {
    const proj = await this.db.queryOne<{ client_user_id: string | null }>(
      `select c.user_id as client_user_id from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
    const taskTitle = note ? `Info requested from applicant: ${note}` : 'Info requested from applicant';
    await this.db.execute(
      `insert into public.tasks (id, application_id, title, status, assigned_to, due_date) values ($1,$2,$3,'Open',$4,current_date + 7)`,
      [randomUUID(), applicationId, taskTitle, proj?.client_user_id ?? null],
    );
    const noteBody = note ? `Additional information has been requested. Please review tasks and provide requested documents/details. Note: ${note}` : 'Additional information has been requested. Please review tasks and provide requested documents/details.';
    await this.db.execute(
      `insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`,
      [randomUUID(), applicationId, noteBody, actorUserId],
    );
  }

  async getHistory(actor: CurrentUser, applicationId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return [];
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.db.query(
      `select id, application_id as "applicationId", from_status as "fromStatus", to_status as "toStatus", changed_by as "changedBy", changed_at as "changedAt", note from public.application_status_history where application_id=$1 order by changed_at asc`,
      [applicationId],
    );
  }

  async listNotes(actor: CurrentUser, applicationId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return [];
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.db.query(
      `select id, application_id as "applicationId", body, created_by as "createdBy", created_at as "createdAt" from public.notes where application_id=$1 order by created_at asc`,
      [applicationId],
    );
  }

  async createNote(actor: CurrentUser, applicationId: string, body: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    const noteId = randomUUID();
    await this.db.execute(
      `insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`,
      [noteId, applicationId, body, actor.userId],
    );
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'notes',$2,'CreateNote',$3,now(),$4::jsonb)`,
      [randomUUID(), noteId, actor.userId, JSON.stringify({ applicationId })],
    );
    return this.db.queryOne(
      `select id, application_id as "applicationId", body, created_by as "createdBy", created_at as "createdAt" from public.notes where id=$1`,
      [noteId],
    );
  }

  async presignUpload(actor: CurrentUser, applicationId: string, body: { docType: string; fileName: string; contentType?: string }) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);

    // Server-side type validation (§6.3) — the client-side check in
    // FileDropzone is bypassable by calling this endpoint directly. Also
    // strips any directory component, so a crafted fileName can't traverse
    // out of this application's storage prefix.
    const safeFileName = validateDocumentUpload(body.fileName, body.contentType);
    const storagePath = `applications/${applicationId}/${randomUUID().replace(/-/g, '')}-${safeFileName}`;
    const uploadUrl = await this.createSignedUploadUrl('loan-documents', storagePath);
    return { bucket: 'loan-documents', storagePath, uploadUrl, expiresInSeconds: 7200 };
  }

  async confirmUpload(actor: CurrentUser, applicationId: string, body: { docType: string; storagePath: string; status?: string }) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);

    // The caller supplies this path, so it must be confirmed to belong to the
    // application it is being recorded against. Otherwise a client can record
    // a row on their own application pointing at another borrower's object
    // key, then request a download URL for it — the ownership check passes,
    // and the URL is signed with the service role key, which bypasses storage
    // RLS. Only presignUpload should ever mint an object key.
    assertStoragePathWithinApplication(body.storagePath, applicationId);

    const docId = randomUUID();
    await this.db.execute(
      `insert into public.loan_documents (id, application_id, doc_type, storage_path, status, uploaded_by, uploaded_at) values ($1,$2,$3,$4,$5,$6,now())`,
      [docId, applicationId, body.docType, body.storagePath, body.status || 'Pending', actor.userId],
    );
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'ConfirmDocumentUpload',$3,now(),$4::jsonb)`,
      [randomUUID(), docId, actor.userId, JSON.stringify({ docType: body.docType, storagePath: body.storagePath })],
    );
    return this.db.queryOne(
      `select id, application_id as "applicationId", doc_type as "docType", storage_path as "storagePath", status, uploaded_by as "uploadedBy", uploaded_at as "uploadedAt" from public.loan_documents where id=$1`,
      [docId],
    );
  }

  async listDocuments(actor: CurrentUser, applicationId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return [];
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.db.query(
      `select id, application_id as "applicationId", doc_type as "docType", storage_path as "storagePath", status, uploaded_by as "uploadedBy", uploaded_at as "uploadedAt" from public.loan_documents where application_id=$1 order by uploaded_at desc`,
      [applicationId],
    );
  }

  private async createSignedUploadUrl(bucket: string, storagePath: string): Promise<string> {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase URL/service role key must be configured for presigned uploads.');

    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const endpoint = `${url.replace(/\/$/, '')}/storage/v1/object/upload/sign/${bucket}/${encodedPath}`;

    const response = await axios.post(endpoint, {}, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    });

    const token = response.data?.token;
    if (!token) throw new Error('Supabase response did not include signed upload token.');
    return `${endpoint}?token=${encodeURIComponent(token)}`;
  }
}
