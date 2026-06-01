import { CurrentUser } from '../auth/roles.helper';
import { DocumentsService } from './documents.service';
export declare class DocumentsController {
    private readonly svc;
    constructor(svc: DocumentsService);
    list(u: CurrentUser): Promise<any[]>;
    create(u: CurrentUser, body: any): Promise<any>;
    verify(u: CurrentUser, appId: string, docId: string, body: any): Promise<void>;
}
