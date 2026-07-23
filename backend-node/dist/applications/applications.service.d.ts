import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class ApplicationsService {
    private readonly db;
    constructor(db: DatabaseService);
    private getRoles;
    private getSecurityProjection;
    private ensureCanAccess;
    private ensureWithinLoanLimits;
    private ensureTransitionAllowed;
    private getById;
    private insertStatusHistory;
    private insertAuditLog;
    private createStatusNotifications;
    private ensureLoanCreatedForApproved;
    create(actor: CurrentUser, body: {
        clientId?: string;
        requestedAmount: number;
        termMonths: number;
        purpose: string;
        businessName?: string;
        registrationNo?: string;
        address?: string;
        assignedToUserId?: string;
    }): Promise<any>;
    update(actor: CurrentUser, applicationId: string, body: {
        requestedAmount: number;
        termMonths: number;
        purpose: string;
        assignedToUserId?: string;
    }): Promise<any>;
    list(actor: CurrentUser): Promise<any[]>;
    getOne(actor: CurrentUser, applicationId: string): Promise<any>;
    private ensureRequiredDocumentsPresent;
    submit(actor: CurrentUser, applicationId: string, note: string | null): Promise<any>;
    changeStatus(actor: CurrentUser, applicationId: string, toStatus: string, note: string | null): Promise<any>;
    private createInfoRequestedFollowUp;
    getHistory(actor: CurrentUser, applicationId: string): Promise<any[]>;
    listNotes(actor: CurrentUser, applicationId: string): Promise<any[]>;
    createNote(actor: CurrentUser, applicationId: string, body: string): Promise<any>;
    presignUpload(actor: CurrentUser, applicationId: string, body: {
        docType: string;
        fileName: string;
        contentType?: string;
    }): Promise<{
        bucket: string;
        storagePath: string;
        uploadUrl: string;
        expiresInSeconds: number;
    } | null>;
    confirmUpload(actor: CurrentUser, applicationId: string, body: {
        docType: string;
        storagePath: string;
        status?: string;
    }): Promise<any>;
    listDocuments(actor: CurrentUser, applicationId: string): Promise<any[]>;
    private createSignedUploadUrl;
}
