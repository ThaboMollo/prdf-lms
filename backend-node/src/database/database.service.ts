import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { currentTenant, currentRlsClient } from '../tenancy/request-context';

/**
 * Postgres access, scoped to the tenant in the current request context.
 *
 * Was a single pool built from SUPABASE_DB_CONNECTION_STRING at boot. Now one
 * pool per tenant, created lazily on first use and cached
 * (docs/multi-tenant-spec.md §W2).
 *
 * There is deliberately NO default pool. Every entry point resolves the tenant
 * from context and throws if there isn't one — a fallback pool is precisely how
 * a request ends up reading another tenant's database.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  /** slug -> pool. Bounded by MAX_POOLS; least-recently-used evicted. */
  private readonly pools = new Map<string, Pool>();
  private readonly lastUsed = new Map<string, number>();

  /**
   * Cap on simultaneously-open pools per function instance. Each pool holds up
   * to `max` connections, so the fleet worst case is
   * instances × MAX_POOLS × max. Raise only alongside the Supavisor limits.
   */
  private static readonly MAX_POOLS = 10;

  async onModuleDestroy() {
    await Promise.all([...this.pools.values()].map((pool) => pool.end().catch(() => undefined)));
    this.pools.clear();
    this.lastUsed.clear();
  }

  /** The pool for the tenant in context, created on first use. */
  private poolForCurrentTenant(): Pool {
    const tenant = currentTenant();
    const existing = this.pools.get(tenant.slug);
    if (existing) {
      this.lastUsed.set(tenant.slug, Date.now());
      return existing;
    }

    this.evictIfNeeded();

    const pool = new Pool({
      connectionString: tenant.databaseUrl,
      // Real Supabase (direct or pooled) always requires SSL. Only ever
      // disable via DATABASE_SSL=false for local development against a
      // bare local Postgres that doesn't support it.
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      // Small per-instance max: on serverless, each cold function instance
      // gets its own pool, and the Supavisor transaction-mode pooler (not
      // this Pool) is what actually protects Postgres from a connection
      // storm across many concurrent instances. A large per-instance max
      // here would defeat that — and it now multiplies by tenant count.
      max: 3,
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => this.logger.error(`Unexpected pool error [${tenant.slug}]`, err));

    this.pools.set(tenant.slug, pool);
    this.lastUsed.set(tenant.slug, Date.now());
    this.logger.log(`Opened database pool for tenant "${tenant.slug}" (${this.pools.size} open)`);
    return pool;
  }

  private evictIfNeeded() {
    if (this.pools.size < DatabaseService.MAX_POOLS) return;

    let oldestSlug: string | null = null;
    let oldestAt = Infinity;
    for (const [slug, at] of this.lastUsed) {
      if (at < oldestAt) {
        oldestAt = at;
        oldestSlug = slug;
      }
    }
    if (!oldestSlug) return;

    const pool = this.pools.get(oldestSlug);
    this.pools.delete(oldestSlug);
    this.lastUsed.delete(oldestSlug);
    this.logger.log(`Evicting idle pool for tenant "${oldestSlug}" (pool cap reached)`);
    // Drain in the background; in-flight queries finish first.
    pool?.end().catch((err) => this.logger.warn(`Failed to close pool for ${oldestSlug}: ${err}`));
  }

  /** The RLS-scoped client for this request if one is open, else the tenant's pool. */
  private currentClient(): PoolClient | Pool {
    return currentRlsClient() ?? this.poolForCurrentTenant();
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
    const rlsClient = currentRlsClient();
    if (rlsClient) {
      return fn(rlsClient);
    }

    const client = await this.poolForCurrentTenant().connect();
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
    return this.poolForCurrentTenant().connect();
  }
}
