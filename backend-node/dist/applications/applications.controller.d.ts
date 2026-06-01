import { CurrentUser } from '../auth/roles.helper';
import { ApplicationsService } from './applications.service';
export declare class ApplicationsController {
    private readonly svc;
    constructor(svc: ApplicationsService);
    create(user: CurrentUser, body: any): Promise<any>;
    update(user: CurrentUser, id: string, body: any): Promise<any>;
    list(user: CurrentUser): Promise<any[]>;
    getOne(user: CurrentUser, id: string): Promise<any>;
    submit(user: CurrentUser, id: string, body: any): Promise<any>;
    changeStatus(user: CurrentUser, id: string, body: any): Promise<any>;
    history(user: CurrentUser, id: string): Promise<any[]>;
    listNotes(user: CurrentUser, id: string): Promise<any[]>;
    createNote(user: CurrentUser, id: string, body: any): Promise<any>;
    presignUpload(user: CurrentUser, id: string, body: any): Promise<{
        bucket: string;
        storagePath: string;
        uploadUrl: string;
        expiresInSeconds: number;
    } | null>;
    confirmUpload(user: CurrentUser, id: string, body: any): Promise<any>;
    listDocuments(user: CurrentUser, id: string): Promise<any[]>;
}
