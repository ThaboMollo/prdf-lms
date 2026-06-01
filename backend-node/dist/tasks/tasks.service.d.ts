import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class TasksService {
    private readonly db;
    constructor(db: DatabaseService);
    private getRoles;
    list(actor: CurrentUser, applicationId?: string, assignedToMe?: boolean): Promise<any[]>;
    create(actor: CurrentUser, body: {
        applicationId: string;
        title: string;
        assignedTo?: string;
        dueDate?: string;
    }): Promise<any>;
    update(actor: CurrentUser, taskId: string, body: {
        title?: string;
        assignedTo?: string;
        dueDate?: string;
    }): Promise<any>;
    complete(actor: CurrentUser, taskId: string, note?: string): Promise<any>;
}
