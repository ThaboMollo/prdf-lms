import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, fetchUserRoles, hasAnyRole, hasRole, isStaff, ASSIGNED_ROLES } from '../auth/roles.helper';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { currentTenant } from '../tenancy/request-context';
import { ConflictError, NotFoundError, PermissionError, ValidationError } from '../common/errors';

const BUCKET = 'loan-documents';

/** Single projection for document_requests — every read below returns this shape. */
const DOCUMENT_REQUEST_COLUMNS = `select id,
         application_id as "applicationId",
         doc_type as "docType",
         custom_name as "customName",
         details,
         file_type as "fileType",
         status,
         requested_by as "requestedBy",
         requested_at as "requestedAt",
         fulfilled_document_id as "fulfilledDocumentId",
         fulfilled_at as "fulfilledAt",
         cancelled_at as "cancelledAt"
    from public.document_requests`;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Open to any authenticated user, not just staff — the application wizard
   * (client role) needs this to know which documents to ask for, same as
   * loan_products.is_active rows are anon-readable today. Only mutating
   * (createRequirement) stays staff-gated.
   */
  async listRequirements(actor: CurrentUser, productId?: string) {
    if (productId) {
      return this.db.query(
        `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", allows_multiple as "allowsMultiple", created_at as "createdAt" from public.document_requirements where loan_product_id = $1 order by required_at_status asc, doc_type asc`,
        [productId],
      );
    }
    return this.db.query(
      `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", allows_multiple as "allowsMultiple", created_at as "createdAt" from public.document_requirements order by required_at_status asc, doc_type asc`,
    );
  }

  async createRequirement(actor: CurrentUser, body: { loanProductId?: string; requiredAtStatus: string; docType: string; isRequired: boolean }) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    if (!isStaff(roles)) throw new PermissionError('Only management can configure document requirements.')
    const id = randomUUID();
    await this.db.execute(
      `insert into public.document_requirements (id, loan_product_id, required_at_status, doc_type, is_required, created_at) values ($1,$2,$3,$4,$5,now())`,
      [id, body.loanProductId ?? null, body.requiredAtStatus, body.docType, body.isRequired],
    );
    return this.db.queryOne(
      `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", allows_multiple as "allowsMultiple", created_at as "createdAt" from public.document_requirements where id=$1`,
      [id],
    );
  }

  /**
   * Per-application asks raised by a reviewer, newest first.
   *
   * Readable by anyone who can see the application, applicant included — the
   * client portal renders the outstanding ones as upload slots.
   */
  async listRequests(actor: CurrentUser, applicationId: string) {
    await this.ensureCanAccessApplication(actor, applicationId);
    return this.db.query(
      `${DOCUMENT_REQUEST_COLUMNS} where application_id = $1 order by requested_at desc`,
      [applicationId],
    );
  }

  /**
   * Raise a request for a document the applicant has not supplied.
   *
   * Open to the same roles that review documents (screening and due diligence),
   * plus management — asking for a missing payslip is part of reviewing a case,
   * not a configuration change.
   */
  async createRequest(
    actor: CurrentUser,
    applicationId: string,
    body: { docType: string; customName?: string; details?: string; fileType?: string },
  ) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    if (!isStaff(roles) && !hasAnyRole(roles, ...ASSIGNED_ROLES)) {
      throw new PermissionError('Only a reviewer or management can request a document.')
    }
    const proj = await this.ensureCanAccessApplication(actor, applicationId);

    const docType = body.docType.trim();
    if (!docType) throw new ValidationError('A document type is required.')

    // 'Other' carries its name in custom_name; a named type takes its label
    // from DOCUMENT_LABELS, so a second name there would be a second source of
    // truth. The DB constraint says the same thing — this is the friendly path.
    const customName = docType === 'Other' ? (body.customName ?? '').trim() : null;
    if (docType === 'Other' && !customName) {
      throw new ValidationError('Give the requested document a name.')
    }
    if (docType !== 'Other' && body.customName?.trim()) {
      throw new ValidationError('A name can only be given for an "Other" document.')
    }

    const details = body.details?.trim() || null;
    const fileType = body.fileType?.trim() || 'pdf';

    // A document already on file needs re-requesting sometimes (it was rejected,
    // or it expired), so an existing upload is not a bar. A second OPEN ask for
    // the same type is — the applicant would see the same slot twice. The
    // partial unique index enforces it; this turns 23505 into a usable message.
    if (docType !== 'Other') {
      const open = await this.db.queryOne<{ id: string }>(
        `select id from public.document_requests where application_id = $1 and doc_type = $2 and status = 'Pending'`,
        [applicationId, docType],
      );
      if (open) throw new ConflictError('That document has already been requested and is still outstanding.')
    }

    const id = randomUUID();
    await this.db.execute(
      `insert into public.document_requests (id, application_id, doc_type, custom_name, details, file_type, status, requested_by, requested_at)
       values ($1,$2,$3,$4,$5,$6,'Pending',$7,now())`,
      [id, applicationId, docType, customName, details, fileType, actor.userId],
    );

    await this.notifyApplicantOfRequest(applicationId, proj.clientOwnerUserId, actor.userId, {
      requestId: id,
      docType,
      customName,
      details,
      fileType,
    });

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'document_requests',$2,'CreateDocumentRequest',$3,now(),$4::jsonb)`,
      [randomUUID(), id, actor.userId, JSON.stringify({ applicationId, docType, customName, fileType })],
    );

    return this.db.queryOne(`${DOCUMENT_REQUEST_COLUMNS} where id = $1`, [id]);
  }

  /** Withdraw an outstanding request. Cancelled, never deleted — it is case history. */
  async cancelRequest(actor: CurrentUser, applicationId: string, requestId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    if (!isStaff(roles) && !hasAnyRole(roles, ...ASSIGNED_ROLES)) {
      throw new PermissionError('Only a reviewer or management can withdraw a document request.')
    }
    await this.ensureCanAccessApplication(actor, applicationId);

    const affected = await this.db.execute(
      `update public.document_requests set status='Cancelled', cancelled_at=now()
       where id=$1 and application_id=$2 and status='Pending'`,
      [requestId, applicationId],
    );
    if (affected === 0) throw new NotFoundError('No outstanding document request to withdraw.')

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'document_requests',$2,'CancelDocumentRequest',$3,now(),$4::jsonb)`,
      [randomUUID(), requestId, actor.userId, JSON.stringify({ applicationId })],
    );

    return this.db.queryOne(`${DOCUMENT_REQUEST_COLUMNS} where id = $1`, [requestId]);
  }

  /**
   * Link an upload to the request that asked for it.
   *
   * Called from ApplicationsService.confirmUpload, inside the same request (and
   * therefore the same RLS transaction) as the loan_documents insert — so a
   * failure here rolls the document row back with it rather than leaving a
   * request that is quietly still outstanding.
   *
   * Silently does nothing if the request is not outstanding: the applicant may
   * have uploaded twice, or the reviewer withdrawn the ask mid-upload. Neither
   * should fail the upload the applicant just made.
   */
  async fulfilRequest(applicationId: string, requestId: string, documentId: string): Promise<boolean> {
    const affected = await this.db.execute(
      `update public.document_requests
          set status='Fulfilled', fulfilled_document_id=$1, fulfilled_at=now()
        where id=$2 and application_id=$3 and status='Pending'`,
      [documentId, requestId, applicationId],
    );
    return affected > 0;
  }

  /**
   * In-app notification to the applicant. Best-effort by design: an unroutable
   * request (assisted onboarding, where the client has no auth user yet) must
   * not stop the reviewer raising it — the admin case screen still shows it.
   */
  private async notifyApplicantOfRequest(
    applicationId: string,
    clientOwnerUserId: string | null,
    actorUserId: string,
    payload: { requestId: string; docType: string; customName: string | null; details: string | null; fileType: string },
  ) {
    if (!clientOwnerUserId || clientOwnerUserId === actorUserId) return;

    const name = payload.customName ?? payload.docType;
    const message = payload.details
      ? `${name} is needed to continue reviewing your application. ${payload.details}`
      : `${name} is needed to continue reviewing your application.`;

    await this.db.execute(
      `insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
       values ($1,$2,'InApp','DocumentRequested','Document requested',$3,'Sent',$4::jsonb,now(),now())`,
      [randomUUID(), clientOwnerUserId, message, JSON.stringify({ applicationId, ...payload })],
    );
  }

  async verifyDocument(actor: CurrentUser, applicationId: string, documentId: string, status: string, note?: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    // Verifying/rejecting documents is screening work (Program Officer) and due
    // diligence (Risk Analyst), plus management.
    if (!isStaff(roles) && !hasAnyRole(roles, 'ProgramOfficer', 'RiskAnalyst')) {
      throw new PermissionError('Only a Program Officer, Risk Analyst, or management can review documents.')
    }
    const affected = await this.db.execute(
      `update public.loan_documents set status=$1, verification_note=$2, verified_by=$3, verified_at=now() where id=$4 and application_id=$5`,
      [status, note ?? null, actor.userId, documentId, applicationId],
    );
    if (affected === 0) throw new NotFoundError('Document not found for application.')
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'VerifyDocument',$3,now(),$4::jsonb)`,
      [randomUUID(), documentId, actor.userId, JSON.stringify({ status, note })],
    );
  }

  /** Staff (review/verify), the assigned Intern/Originator, or the owning Client can view. */
  private async ensureCanAccessApplication(actor: CurrentUser, applicationId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.db.queryOne<{ status: string; assignedToUserId: string | null; clientOwnerUserId: string | null }>(
      `select la.status, la.assigned_to_user_id as "assignedToUserId", c.user_id as "clientOwnerUserId"
       from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
    if (!proj) throw new NotFoundException('Application not found.');
    if (isStaff(roles)) return proj;
    if (hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assignedToUserId === actor.userId) return proj;
    if (hasRole(roles, 'Client') && proj.clientOwnerUserId === actor.userId) return proj;
    throw new PermissionError('User cannot access this application.')
  }

  /**
   * Only the owning Client, only while the application is still Draft — an
   * exact mirror of the "documents delete by client on draft" RLS policy
   * (both the loan_documents row policy and the matching storage.objects
   * policy for the same bucket/condition). No staff-delete path exists
   * anywhere in the DB layer, so none is added here either.
   */
  async deleteDocument(actor: CurrentUser, applicationId: string, documentId: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    const proj = await this.db.queryOne<{ status: string; clientOwnerUserId: string | null }>(
      `select la.status, c.user_id as "clientOwnerUserId" from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
    if (!proj) throw new NotFoundException('Application not found.');
    if (!(hasRole(roles, 'Client') && proj.clientOwnerUserId === actor.userId)) {
      throw new PermissionError('Only the applicant can delete a document.')
    }
    if (proj.status !== 'Draft') throw new ConflictError('Documents can only be deleted while the application is a Draft.')

    const doc = await this.db.queryOne<{ storage_path: string }>(
      `select storage_path from public.loan_documents where id = $1 and application_id = $2`,
      [documentId, applicationId],
    );
    if (!doc) throw new NotFoundException('Document not found for application.');

    await this.deleteStorageObject(doc.storage_path);
    const affected = await this.db.execute(`delete from public.loan_documents where id = $1`, [documentId]);
    if (affected === 0) throw new ConflictError('Document was not deleted.')
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'DeleteDocument',$3,now(),$4::jsonb)`,
      [randomUUID(), documentId, actor.userId, JSON.stringify({ applicationId })],
    );
  }

  async getSignedDownloadUrl(actor: CurrentUser, applicationId: string, documentId: string): Promise<string> {
    await this.ensureCanAccessApplication(actor, applicationId);
    const doc = await this.db.queryOne<{ storage_path: string }>(
      `select storage_path from public.loan_documents where id = $1 and application_id = $2`,
      [documentId, applicationId],
    );
    if (!doc) throw new NotFoundException('Document not found for application.');
    return this.createSignedDownloadUrl(doc.storage_path);
  }

  private async deleteStorageObject(storagePath: string): Promise<void> {
    // Scoped to the tenant that owns THIS request. Reading these from
    // process.env would mint credentials for whichever tenant the
    // process happened to be configured with — i.e. sign a URL against
    // the wrong tenant's storage bucket. currentTenant() throws if no
    // tenant is in context; the registry guarantees both fields at boot.
    const { supabaseUrl: url, serviceRoleKey: serviceKey } = currentTenant();

    const endpoint = `${url.replace(/\/$/, '')}/storage/v1/object/${BUCKET}`;
    await axios.delete(endpoint, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      data: { prefixes: [storagePath] },
    });
  }

  private async createSignedDownloadUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
    // Scoped to the tenant that owns THIS request. Reading these from
    // process.env would mint credentials for whichever tenant the
    // process happened to be configured with — i.e. sign a URL against
    // the wrong tenant's storage bucket. currentTenant() throws if no
    // tenant is in context; the registry guarantees both fields at boot.
    const { supabaseUrl: url, serviceRoleKey: serviceKey } = currentTenant();

    const base = url.replace(/\/$/, '');
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const endpoint = `${base}/storage/v1/object/sign/${BUCKET}/${encodedPath}`;

    const response = await axios.post(
      endpoint,
      { expiresIn: expiresInSeconds },
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' } },
    );

    const signedURL = response.data?.signedURL;
    if (!signedURL) {
      this.logger.error('Supabase sign response contained no signedURL.');
      throw new InternalServerErrorException();
    }
    // Real-world responses have been observed as both a full absolute URL
    // and a bucket-relative path depending on version — handle both rather
    // than assume one.
    return signedURL.startsWith('http') ? signedURL : `${base}/storage/v1${signedURL}`;
  }
}
