import { CurrentUser } from '../auth/roles.helper';
import { TasksService } from './tasks.service';
export declare class TasksController {
    private readonly svc;
    constructor(svc: TasksService);
    list(u: CurrentUser, appId?: string, atm?: string): Promise<any[]>;
    create(u: CurrentUser, body: any): Promise<any>;
    update(u: CurrentUser, id: string, body: any): Promise<any>;
    complete(u: CurrentUser, id: string, body: any): Promise<any>;
}
