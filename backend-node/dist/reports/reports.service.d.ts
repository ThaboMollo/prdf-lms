import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
export declare class ReportsService {
    private readonly db;
    constructor(db: DatabaseService);
    private ensureStaff;
    portfolio(actor: CurrentUser): Promise<any>;
    arrears(actor: CurrentUser): Promise<any[]>;
    audit(actor: CurrentUser, from?: string, to?: string, limit?: number): Promise<any[]>;
    turnaround(actor: CurrentUser): Promise<any>;
    pipelineConversion(actor: CurrentUser): Promise<any[]>;
    productivity(actor: CurrentUser): Promise<any[]>;
    pipelineSummary(actor: CurrentUser, startDate?: string, endDate?: string): Promise<any[]>;
    originationTrends(actor: CurrentUser, startDate?: string, endDate?: string): Promise<any[]>;
}
