import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class AdminService {
    private readonly db;
    constructor(db: DatabaseService);
    listUserAccess(actor: CurrentUser, query: {
        filter?: string;
        role?: string;
        search?: string;
    }): Promise<{
        userId: string;
        fullName: string | null;
        email: string | null;
        roles: string[];
        isAdmin: boolean;
        isInternal: boolean;
        canGrant: boolean;
        canRevoke: boolean;
        grantDisabledReason: string | null;
        revokeDisabledReason: string | null;
    }[]>;
    grantAdmin(actor: CurrentUser, targetUserId: string): Promise<{
        userId: string;
        roles: any[];
        isAdmin: boolean;
    }>;
    revokeAdmin(actor: CurrentUser, targetUserId: string): Promise<{
        userId: string;
        roles: any[];
        isAdmin: boolean;
    }>;
}
