import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class NfsService {
    private readonly db;
    constructor(db: DatabaseService);
    private getRoles;
    private ensureInternal;
    list(actor: CurrentUser, clientId: string): Promise<any[]>;
    create(actor: CurrentUser, clientId: string, body: {
        applicationId?: string;
        supportType: string;
        durationHours: number;
        dateProvided: string;
        notes?: string;
    }): Promise<any>;
}
