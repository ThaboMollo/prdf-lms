import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, fetchUserRoles, hasAnyRole, hasRole, isStaff, ASSIGNED_ROLES } from '../auth/roles.helper';
import { randomUUID } from 'crypto';
import axios from 'axios';

const BUCKET = 'loan-documents';

@Injectable()
export class DocumentsService {
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
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
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

  async verifyDocument(actor: CurrentUser, applicationId: string, documentId: string, status: string, note?: string) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
    const affected = await this.db.execute(
      `update public.loan_documents set status=$1, verification_note=$2, verified_by=$3, verified_at=now() where id=$4 and application_id=$5`,
      [status, note ?? null, actor.userId, documentId, applicationId],
    );
    if (affected === 0) throw new Error('Document not found for application.');
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
    throw new Error('User cannot access this application.');
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
      throw new Error('Only the applicant can delete a document.');
    }
    if (proj.status !== 'Draft') throw new Error('Documents can only be deleted while the application is a Draft.');

    const doc = await this.db.queryOne<{ storage_path: string }>(
      `select storage_path from public.loan_documents where id = $1 and application_id = $2`,
      [documentId, applicationId],
    );
    if (!doc) throw new NotFoundException('Document not found for application.');

    await this.deleteStorageObject(doc.storage_path);
    const affected = await this.db.execute(`delete from public.loan_documents where id = $1`, [documentId]);
    if (affected === 0) throw new Error('Document was not deleted.');
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
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase URL/service role key must be configured for storage deletion.');

    const endpoint = `${url.replace(/\/$/, '')}/storage/v1/object/${BUCKET}`;
    await axios.delete(endpoint, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      data: { prefixes: [storagePath] },
    });
  }

  private async createSignedDownloadUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase URL/service role key must be configured for signed downloads.');

    const base = url.replace(/\/$/, '');
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const endpoint = `${base}/storage/v1/object/sign/${BUCKET}/${encodedPath}`;

    const response = await axios.post(
      endpoint,
      { expiresIn: expiresInSeconds },
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' } },
    );

    const signedURL = response.data?.signedURL;
    if (!signedURL) throw new Error('Supabase response did not include a signed URL.');
    // Real-world responses have been observed as both a full absolute URL
    // and a bucket-relative path depending on version — handle both rather
    // than assume one.
    return signedURL.startsWith('http') ? signedURL : `${base}/storage/v1${signedURL}`;
  }
}
