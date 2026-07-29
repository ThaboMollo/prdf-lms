import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantRegistryService } from './tenant-registry.service';
import { requestContext } from './request-context';

/**
 * Establishes the tenant for every request, before guards run.
 *
 * Middleware — not a guard or interceptor — because SupabaseAuthGuard already
 * needs the tenant: it picks a JWKS by issuer and reads roles from that
 * tenant's database. Nest runs middleware before guards, so the context is in
 * place by then.
 *
 * ── STEP 1 SCOPE (docs/multi-tenant-spec.md §7) ──────────────────────────
 * Resolution here is single-tenant only: exactly one configured tenant, used
 * for every request. Issuer-based resolution (§1.1) arrives with the
 * tenant-aware auth guard in step 2.
 *
 * If more than one tenant is configured, this middleware REFUSES THE REQUEST
 * rather than guessing. That is deliberate: it makes the sequencing in §7
 * impossible to skip. You cannot serve two tenants until the guard can tell
 * them apart cryptographically — the failure is a loud 500 at the door
 * instead of a silent cross-tenant read.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);
  private warnedMultiTenant = false;

  constructor(private readonly registry: TenantRegistryService) {}

  use(_req: Request, _res: Response, next: NextFunction) {
    const tenants = this.registry.all();

    if (tenants.length === 0) {
      throw new Error('No tenants configured — refusing to serve requests.');
    }

    if (tenants.length > 1) {
      if (!this.warnedMultiTenant) {
        this.warnedMultiTenant = true;
        this.logger.error(
          `${tenants.length} tenants are configured, but tenant resolution is still ` +
            `single-tenant (step 1). Requests are being refused rather than routed to a ` +
            `guessed tenant. Complete step 2 (issuer-based resolution in SupabaseAuthGuard) ` +
            `before configuring more than one tenant.`,
        );
      }
      throw new Error(
        'Multiple tenants configured but issuer-based resolution is not enabled yet. ' +
          'Refusing to guess which tenant this request belongs to.',
      );
    }

    requestContext.run({ tenant: tenants[0] }, () => next());
  }
}
