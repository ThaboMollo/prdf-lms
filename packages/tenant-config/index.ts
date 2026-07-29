import type { TenantConfig } from './schema';
import { prdf } from './tenants/prdf';
import { kgolo } from './tenants/kgolo';

/**
 * Runtime tenant resolution for the frontends
 * (docs/multi-tenant-spec.md §W7).
 *
 * The apps used to import a specific tenant directly — `tenants/prdf` in 11
 * places — which meant the tenant was fixed at BUILD time and every client
 * needed their own Vercel project and their own deploy. Resolving from the
 * hostname instead means one project per app serves every client, and
 * onboarding is a config entry plus a DNS record.
 *
 * Cost of the trade: every tenant's branding ships in every bundle. At a
 * handful of tenants that is kilobytes. Revisit past roughly 20.
 */
export const TENANTS: readonly TenantConfig[] = [prdf, kgolo];

export type { TenantConfig };

/**
 * Find the tenant serving a hostname. Returns null rather than falling back —
 * there is no default tenant anywhere in this system, and quietly serving one
 * client's branding on another's domain would be worse than an error page.
 */
export function resolveTenantByDomain(hostname: string): TenantConfig | null {
  const host = hostname.trim().toLowerCase();
  return TENANTS.find((tenant) => tenant.domains.some((d) => d.toLowerCase() === host)) ?? null;
}

export function resolveTenantById(id: string): TenantConfig | null {
  const wanted = id.trim().toLowerCase();
  return TENANTS.find((tenant) => tenant.id.toLowerCase() === wanted) ?? null;
}

/**
 * Resolve the tenant for the current page load.
 *
 * `overrideId` exists for local development, where the hostname is `localhost`
 * and matches nothing. It is an EXPLICIT opt-in (VITE_TENANT_ID), not a
 * fallback — an unset override on an unrecognised host still fails, which is
 * the behaviour production needs.
 */
export function resolveTenant(hostname: string, overrideId?: string): TenantConfig | null {
  if (overrideId?.trim()) return resolveTenantById(overrideId);
  return resolveTenantByDomain(hostname);
}

// --- Active tenant --------------------------------------------------------
// A module-level singleton rather than React context: the tenant is fixed for
// the lifetime of a page load, and threading a provider through every consumer
// (PublicNav, LoginPage, ApplyPage, GlobalLoader in ui-kit, …) would be a lot
// of churn for a value that never changes. Set once during bootstrap, before
// anything renders.

let active: TenantConfig | null = null;

export function setActiveTenant(tenant: TenantConfig): void {
  active = tenant;
}

/**
 * The tenant for this page load.
 *
 * Throws if bootstrap has not resolved one. That is deliberate: a component
 * rendering with no tenant means resolution was skipped or failed, and showing
 * some arbitrary tenant's logo and copy would be a worse outcome than a
 * visible error.
 */
export function activeTenant(): TenantConfig {
  if (!active) {
    throw new Error(
      'No active tenant. resolveTenant()/setActiveTenant() must run during bootstrap, ' +
        'before anything renders — see each app main.tsx.',
    );
  }
  return active;
}

/** Every hostname across all tenants — used to detect config collisions. */
export function allDomains(): string[] {
  return TENANTS.flatMap((tenant) => tenant.domains.map((d) => d.toLowerCase()));
}

/**
 * Guards against two tenants claiming the same hostname, which would make
 * resolution order-dependent. Called at bootstrap so it fails immediately in
 * development rather than serving the wrong brand in production.
 */
export function assertNoDomainCollisions(): void {
  const seen = new Map<string, string>();
  for (const tenant of TENANTS) {
    for (const domain of tenant.domains) {
      const key = domain.toLowerCase();
      const owner = seen.get(key);
      if (owner && owner !== tenant.id) {
        throw new Error(`Tenant domain collision: "${key}" is claimed by both "${owner}" and "${tenant.id}".`);
      }
      seen.set(key, tenant.id);
    }
  }
}
