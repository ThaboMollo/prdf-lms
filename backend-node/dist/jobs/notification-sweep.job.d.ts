import { NotificationsService } from '../notifications/notifications.service';
export declare class NotificationSweepJob {
    private readonly notificationsService;
    private readonly logger;
    constructor(notificationsService: NotificationsService);
    handle(): Promise<void>;
}
