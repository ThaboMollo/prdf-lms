import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class LoansService {
    private readonly db;
    constructor(db: DatabaseService);
    private getRoles;
    private getLoanDetails;
    getById(actor: CurrentUser, loanId: string): Promise<any>;
    disburse(actor: CurrentUser, loanId: string, body: {
        amount: number;
        reference?: string;
    }): Promise<any>;
    recordRepayment(actor: CurrentUser, loanId: string, body: {
        amount: number;
        paidAt?: string;
        paymentReference?: string;
    }): Promise<any>;
    private buildRepaymentSchedule;
    private applyRepaymentToSchedule;
}
