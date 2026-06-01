import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, isStaff } from '../auth/roles.helper';
import { randomUUID } from 'crypto';

@Injectable()
export class DocumentsService {
  constructor(private readonly db: DatabaseService) {}

  private async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [userId]);
    return [...new Set(rows.map((r) => r.name))];
  }

  async listRequirements(actor: CurrentUser) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
    return this.db.query(
      `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", created_at as "createdAt" from public.document_requirements order by required_at_status asc, doc_type asc`,
    );
  }

  async createRequirement(actor: CurrentUser, body: { loanProductId?: string; requiredAtStatus: string; docType: string; isRequired: boolean }) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
    const id = randomUUID();
    await this.db.execute(
      `insert into public.document_requirements (id, loan_product_id, required_at_status, doc_type, is_required, created_at) values ($1,$2,$3,$4,$5,now())`,
      [id, body.loanProductId ?? null, body.requiredAtStatus, body.docType, body.isRequired],
    );
    return this.db.queryOne(
      `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", created_at as "createdAt" from public.document_requirements where id=$1`,
      [id],
    );
  }

  async verifyDocument(actor: CurrentUser, applicationId: string, documentId: string, status: string, note?: string) {
    const roles = await this.getRoles(actor.userId);
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
}
