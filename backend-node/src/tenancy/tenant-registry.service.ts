import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ResolvedTenant, describeTenant } from './tenant.types';

/**
 * Loads and validates every tenant's private configuration at boot
 * (docs/multi-tenant-spec.md §2.2).
 *
 * Two supported shapes:
 *
 *   Multi-tenant (target):
 *     TENANTS=prdf,kgolo
 *     TENANT_PRDF_ISSUER=https://<ref>.supabase.co/auth/v1
 *     TENANT_PRDF_SUPABASE_URL=https://<ref>.supabase.co
 *     TENANT_PRDF_SERVICE_ROLE_KEY=...
 *     TENANT_PRDF_DB_URL=postgresql://...
 *     TENANT_PRDF_DOMAINS=app.prdf.co.za,prdf-lms.vercel.app
 *
 *   Legacy single-tenant (deprecated, still supported so the existing
 *   deployment keeps working without an env change):
 *     SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_CONNECTION_STRING
 *
 * A tenant listed in TENANTS but missing any field is a HARD BOOT FAILURE.
 * Starting half-configured is the worst outcome available here — it is how a
 * tenant ends up quietly falling back to another tenant's connection.
 *
 * Validation is hand-rolled rather than zod: backend-node has no zod
 * dependency, and adding one for six string fields is not worth the install.
 * The error messages below are deliberately specific enough to fix from a
 * deploy log without reading this file.
 */
@Injectable()
export class TenantRegistryService implements OnModuleInit {
  private readonly logger = new Logger(TenantRegistryService.name);

  private readonly bySlug = new Map<string, ResolvedTenant>();
  private readonly byIssuer = new Map<string, ResolvedTenant>();
  private readonly byDomain = new Map<string, ResolvedTenant>();

  onModuleInit() {
    const slugs = (process.env.TENANTS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const tenants = slugs.length ? slugs.map((slug) => this.readTenant(slug)) : [this.readLegacyTenant()];

    for (const tenant of tenants) {
      if (this.byIssuer.has(tenant.issuer)) {
        throw new Error(
          `Tenant misconfiguration: issuer "${tenant.issuer}" is claimed by both ` +
            `"${this.byIssuer.get(tenant.issuer)!.slug}" and "${tenant.slug}". ` +
            `Issuers must be unique — they are how requests are routed to a tenant.`,
        );
      }
      this.bySlug.set(tenant.slug, tenant);
      this.byIssuer.set(tenant.issuer, tenant);
      for (const domain of tenant.domains) {
        const existing = this.byDomain.get(domain);
        if (existing && existing.slug !== tenant.slug) {
          throw new Error(
            `Tenant misconfiguration: domain "${domain}" is claimed by both ` +
              `"${existing.slug}" and "${tenant.slug}".`,
          );
        }
        this.byDomain.set(domain, tenant);
      }
    }

    this.logger.log(
      `Tenant registry loaded: ${tenants.length} tenant(s) — ${tenants.map(describeTenant).join(', ')}`,
    );
  }

  /** All configured tenants — used by the cron sweep and migration tooling. */
  all(): ResolvedTenant[] {
    return [...this.bySlug.values()];
  }

  count(): number {
    return this.bySlug.size;
  }

  /** Cryptographic lookup for authenticated requests (§1.1). */
  findByIssuer(issuer: string): ResolvedTenant | null {
    return this.byIssuer.get(issuer) ?? null;
  }

  /** Origin/Host lookup, for public routes only (§1.2). */
  findByDomain(hostname: string): ResolvedTenant | null {
    return this.byDomain.get(hostname.trim().toLowerCase()) ?? null;
  }

  findBySlug(slug: string): ResolvedTenant | null {
    return this.bySlug.get(slug.trim().toLowerCase()) ?? null;
  }

  // --- loading -------------------------------------------------------------

  private readTenant(slug: string): ResolvedTenant {
    const prefix = `TENANT_${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

    const issuer = this.require(`${prefix}_ISSUER`, slug);
    const supabaseUrl = this.require(`${prefix}_SUPABASE_URL`, slug);
    const serviceRoleKey = this.require(`${prefix}_SERVICE_ROLE_KEY`, slug);
    const databaseUrl = this.require(`${prefix}_DB_URL`, slug);
    const domains = (process.env[`${prefix}_DOMAINS`] ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    return {
      slug,
      issuer: normaliseIssuer(issuer),
      supabaseUrl: supabaseUrl.replace(/\/$/, ''),
      serviceRoleKey,
      databaseUrl,
      domains,
    };
  }

  /**
   * Builds a single tenant from the pre-multi-tenant environment variables so
   * the current deployment keeps working untouched. Remove once every
   * environment sets TENANTS.
   */
  private readLegacyTenant(): ResolvedTenant {
    const supabaseUrl = this.require('SUPABASE_URL', 'legacy single-tenant');
    const serviceRoleKey = this.require('SUPABASE_SERVICE_ROLE_KEY', 'legacy single-tenant');
    const databaseUrl = this.require('SUPABASE_DB_CONNECTION_STRING', 'legacy single-tenant');

    this.logger.warn(
      'TENANTS is not set — running in legacy single-tenant mode from SUPABASE_* variables. ' +
        'Set TENANTS and the per-tenant variables before adding a second tenant.',
    );

    return {
      slug: (process.env.TENANT_ID ?? 'default').trim().toLowerCase(),
      issuer: normaliseIssuer(`${supabaseUrl.replace(/\/$/, '')}/auth/v1`),
      supabaseUrl: supabaseUrl.replace(/\/$/, ''),
      serviceRoleKey,
      databaseUrl,
      domains: [],
    };
  }

  private require(name: string, context: string): string {
    const value = process.env[name];
    if (!value || !value.trim()) {
      throw new Error(
        `Tenant configuration incomplete for "${context}": ${name} is missing or empty. ` +
          `Refusing to start — a partially configured tenant risks routing its requests ` +
          `to another tenant's database.`,
      );
    }
    return value.trim();
  }
}

/** Issuers are compared verbatim against a JWT `iss`, so normalise the trailing slash once. */
function normaliseIssuer(issuer: string): string {
  return issuer.replace(/\/$/, '');
}
