import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class DocumentsService {
    private readonly db;
    constructor(db: DatabaseService);
    private getRoles;
    listRequirements(actor: CurrentUser): Promise<any[]>;
    createRequirement(actor: CurrentUser, body: {
        loanProductId?: string;
        requiredAtStatus: string;
        docType: string;
        isRequired: boolean;
    }): Promise<any>;
    verifyDocument(actor: CurrentUser, applicationId: string, documentId: string, status: string, note?: string): Promise<void>;
}
