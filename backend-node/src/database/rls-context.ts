import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

/**
 * Holds the current request's RLS-scoped, transaction-bound Postgres client
 * (see RlsTransactionInterceptor). DatabaseService checks this before
 * falling back to the raw pool, so every existing `this.db.query(...)` call
 * in every service transparently runs inside the per-request transaction
 * with `request.jwt.claims`/`role authenticated` set — no service method
 * needed to change.
 */
export const rlsContext = new AsyncLocalStorage<PoolClient>();
