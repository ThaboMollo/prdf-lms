/**
 * Server-side tenant record (docs/multi-tenant-spec.md §2.2).
 *
 * This is the PRIVATE half of tenant configuration — connection strings and
 * service-role keys. It is read from environment variables and must never be
 * committed, logged, or returned from a handler.
 *
 * The PUBLIC half (branding, theme tokens, copy, feature flags) stays in
 * `packages/tenant-config`, which is bundled into browser JavaScript. Nothing
 * in this file may ever move there.
 */
export interface ResolvedTenant {
  /** Stable identifier, e.g. 'prdf'. Used in logs, Sentry tags, metrics. */
  readonly slug: string;

  /**
   * The tenant's Supabase Auth issuer, e.g.
   * `https://<ref>.supabase.co/auth/v1`. This is the cryptographic tenant
   * identifier: a JWT's `iss` selects the key set its signature is verified
   * against, so a forged issuer simply fails verification (§1.1).
   */
  readonly issuer: string;

  /** Supabase project URL — signed storage URLs and admin auth calls. */
  readonly supabaseUrl: string;

  /** Service-role key. Bypasses RLS; never leaves the server. */
  readonly serviceRoleKey: string;

  /** Postgres connection string (Supavisor transaction-mode pooler). */
  readonly databaseUrl: string;

  /** Hostnames this tenant serves — used to resolve unauthenticated requests (§1.2). */
  readonly domains: readonly string[];
}

/** Redacted form, safe to log. */
export function describeTenant(tenant: ResolvedTenant): string {
  return `${tenant.slug} (issuer=${tenant.issuer})`;
}
