import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import type { ResolvedTenant } from './tenant.types';

/**
 * Per-request context: which tenant this request belongs to, and (once
 * RlsTransactionInterceptor has opened one) the RLS-scoped transaction client.
 *
 * Established by TenantResolverMiddleware, which runs before guards — the auth
 * guard itself needs the tenant in order to pick a JWKS and to read roles from
 * the right database.
 *
 * The store is a mutable object on purpose: the interceptor attaches `client`
 * to the SAME object later in the request, rather than nesting a second
 * AsyncLocalStorage. One context, one source of truth.
 *
 * Docs: docs/multi-tenant-spec.md §W1.
 */
export interface RequestContext {
  readonly tenant: ResolvedTenant;
  client?: PoolClient;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * The tenant for the current request.
 *
 * Throws rather than returning null. There is no default tenant anywhere in
 * this system (spec §4, invariant 5) — code reaching for a tenant outside a
 * resolved request is a bug, and failing loudly here is far better than
 * silently operating against whichever tenant happens to be first in the
 * registry.
 */
export function currentTenant(): ResolvedTenant {
  const store = requestContext.getStore();
  if (!store) {
    throw new Error(
      'No tenant in context. Every database access, signed URL and service-role ' +
        'call must run inside a resolved tenant request. If this is background ' +
        'work (e.g. the cron sweep), wrap it in requestContext.run({ tenant }, ...) ' +
        'explicitly, once per tenant.',
    );
  }
  return store.tenant;
}

/** The RLS transaction client for this request, if one is open. */
export function currentRlsClient(): PoolClient | undefined {
  return requestContext.getStore()?.client;
}

/**
 * Run `fn` for a specific tenant outside an HTTP request — the cron sweep and
 * migration tooling. Deliberately explicit: there is no ambient default.
 */
export function runForTenant<T>(tenant: ResolvedTenant, fn: () => Promise<T>): Promise<T> {
  return requestContext.run({ tenant }, fn);
}
