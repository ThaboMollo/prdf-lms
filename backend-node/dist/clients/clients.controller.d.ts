import { CurrentUser } from '../auth/roles.helper';
import { ClientsService } from './clients.service';
export declare class ClientsController {
    private readonly clientsService;
    constructor(clientsService: ClientsService);
    createAssisted(user: CurrentUser, body: any): Promise<any>;
    sendInvite(user: CurrentUser, id: string, body: any): Promise<{
        userId: string | null;
        email: string;
        status: string;
        actionLink: string | null;
    } | null>;
}
