import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PoolClient } from 'pg';
export declare class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private pool;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
    execute(sql: string, params?: any[]): Promise<number>;
    withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}
