import { CurrentUser } from '../auth/roles.helper';
import { AdminService } from './admin.service';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    listAccess(user: CurrentUser, filter?: string, role?: string, search?: string): Promise<{
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
    grantAdmin(user: CurrentUser, userId: string): Promise<{
        userId: string;
        roles: any[];
        isAdmin: boolean;
    }>;
    revokeAdmin(user: CurrentUser, userId: string): Promise<{
        userId: string;
        roles: any[];
        isAdmin: boolean;
    }>;
}
