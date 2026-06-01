import { CurrentUser } from '../auth/roles.helper';
import { LoansService } from './loans.service';
export declare class LoansController {
    private readonly svc;
    constructor(svc: LoansService);
    getById(u: CurrentUser, id: string): Promise<any>;
    disburse(u: CurrentUser, id: string, body: any): Promise<any>;
    recordRepayment(u: CurrentUser, id: string, body: any): Promise<any>;
}
