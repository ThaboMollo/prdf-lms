import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { rlsContext } from './rls-context';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  onModuleInit() {
    const connStr = process.env.SUPABASE_DB_CONNECTION_STRING;
    if (!connStr) throw new Error('SUPABASE_DB_CONNECTION_STRING is required');

    this.pool = new Pool({
      connectionString: connStr,
      // Real Supabase (direct or pooled) always requires SSL. Only ever
      // disable via DATABASE_SSL=false for local development against a
      // bare local Postgres that doesn't support it.
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      // Small per-instance max: on serverless, each cold function instance
      // gets its own pool, and the Supavisor transaction-mode pooler (not
      // this Pool) is what actually protects Postgres from a connection
      // storm across many concurrent instances. A large per-instance max
      // here would defeat that.
      max: 3,
      idleTimeoutMillis: 30000,
    });

    this.pool.on('error', (err) => this.logger.error('Unexpected pool error', err));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /** The RLS-scoped client for this request, if RlsTransactionInterceptor opened one. */
  private currentClient(): PoolClient | Pool {
    return rlsContext.getStore() ?? this.pool;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.currentClient().query<any>(sql, params);
    return result.rows as T[];
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params?: any[]): Promise<number> {
    const result = await this.currentClient().query(sql, params);
    return result.rowCount ?? 0;
  }

  /**
   * Checks out a client and begins a transaction — used directly by
   * money-critical code (loans disburse/repay) that needs row locking
   * (`SELECT ... FOR UPDATE`) within an explicit transaction.
   *
   * If a request-scoped RLS transaction is already open (see
   * RlsTransactionInterceptor), runs against that same client instead of
   * opening a second one: Postgres doesn't support true nested BEGIN
   * blocks, and the outer transaction's COMMIT/ROLLBACK already governs
   * atomicity for the whole request.
   */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const rlsClient = rlsContext.getStore();
    if (rlsClient) {
      return fn(rlsClient);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Only for RlsTransactionInterceptor — everything else should go through query/queryOne/execute/withTransaction. */
  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }
}
