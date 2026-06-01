import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
export declare class SupabaseAuthGuard implements CanActivate {
    private readonly db;
    private readonly logger;
    private supabaseAdmin;
    constructor(db: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
