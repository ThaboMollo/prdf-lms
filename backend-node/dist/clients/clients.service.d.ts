import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class ClientsService {
    private readonly db;
    constructor(db: DatabaseService);
    createAssistedClient(actor: CurrentUser, body: {
        businessName: string;
        registrationNo?: string;
        address?: string;
        applicantEmail?: string;
        applicantFullName?: string;
        sendInvite?: boolean;
        redirectTo?: string;
    }): Promise<any>;
    sendInvite(actor: CurrentUser, clientId: string, body: {
        applicantEmail: string;
        applicantFullName?: string;
        redirectTo?: string;
    }): Promise<{
        userId: string | null;
        email: string;
        status: string;
        actionLink: string | null;
    } | null>;
    private prepareUserProfile;
    private inviteUser;
    private inviteUserWithLink;
}
