import { CurrentUser } from '../auth/roles.helper';
import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly svc;
    constructor(svc: NotificationsService);
    list(u: CurrentUser, unreadOnly?: string): Promise<any[]>;
    markRead(u: CurrentUser, id: string): Promise<void>;
}
