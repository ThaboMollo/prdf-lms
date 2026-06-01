import { CurrentUser } from '../auth/roles.helper';
import { ReportsService } from './reports.service';
export declare class ReportsController {
    private readonly svc;
    constructor(svc: ReportsService);
    portfolio(u: CurrentUser): Promise<any>;
    arrears(u: CurrentUser): Promise<any[]>;
    audit(u: CurrentUser, from?: string, to?: string, limit?: string): Promise<any[]>;
    turnaround(u: CurrentUser): Promise<any>;
    pipelineConversion(u: CurrentUser): Promise<any[]>;
    productivity(u: CurrentUser): Promise<any[]>;
}
