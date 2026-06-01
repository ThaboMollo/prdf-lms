import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class NotificationsService {
    private readonly db;
    constructor(db: DatabaseService);
    list(actor: CurrentUser, unreadOnly: boolean): Promise<any[]>;
    markRead(actor: CurrentUser, notificationId: string): Promise<void>;
    runReminderScans(): Promise<void>;
}
