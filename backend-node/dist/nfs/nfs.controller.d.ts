import { CurrentUser } from '../auth/roles.helper';
import { NfsService } from './nfs.service';
export declare class NfsController {
    private readonly svc;
    constructor(svc: NfsService);
    list(u: CurrentUser, clientId: string): Promise<any[]>;
    create(u: CurrentUser, clientId: string, body: any): Promise<any>;
}
