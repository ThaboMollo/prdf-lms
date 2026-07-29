import { Injectable, Logger, NestMiddleware, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { decodeJwt } from 'jose';
import * as Sentry from '@sentry/node';
import { TenantRegistryService } from './tenant-registry.service';
import { requestContext } from './request-context';
import type { ResolvedTenant } from './tenant.types';

/**
 * Decides which tenant a request belongs to, before guards run
 * (docs/multi-tenant-spec.md §1).
 *
 * Routing lives here; verification lives in SupabaseAuthGuard. The split
 * matters:
 *
 *   middleware — "which tenant is this request for?"  (selects a key set)
 *   guard      — "is this token actually valid for that tenant?"  (verifies)
 *
 * The unverified decode below is safe *because* of that split. Reading `iss`
 * without checking the signature only chooses which JWKS to verify against;
 * a forged issuer routes to a key set that will not verify the signature, so
 * the guard rejects it. What must never happen is trusting any other claim
 * from this decode — roles, subject and everything else are read only after
 * verification, from the tenant's own database.
 *
 * Middleware rather than a guard because SupabaseAuthGuard itself needs the
 * tenant: it picks a JWKS by issuer and reads roles from that tenant's
 * database. Nest runs middleware before guards.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  constructor(private readonly registry: TenantRegistryService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const tenant = this.resolve(req);

    // withIsolationScope, not setTag on the global scope: one API process now
    // serves every tenant, and concurrent requests would otherwise overwrite
    // each other's tag. The isolation scope is per-async-context, so each
    // request's events carry its own tenant.
    //
    // Without this, a shared failure domain means one tenant's error storm is
    // indistinguishable from another's in Sentry — you can see that something
    // is broken but not for whom (docs/multi-tenant-spec.md §W8).
    Sentry.withIsolationScope((scope) => {
      scope.setTag('tenant', tenant.slug);
      requestContext.run({ tenant }, () => next());
    });
  }

  private resolve(req: Request): ResolvedTenant {
    const authHeader = req.headers['authorization'];

    // --- Authenticated: route by issuer (§1.1) ------------------------------
    // Security-critical path. An unrecognised issuer is refused outright and
    // never falls back to another tenant, even when only one is configured —
    // a token minted by some other Supabase project must not be honoured.
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();

      let issuer: string | undefined;
      try {
        issuer = decodeJwt(token).iss;
      } catch {
        throw new UnauthorizedException('Malformed token');
      }

      if (!issuer) {
        throw new UnauthorizedException('Token missing issuer claim');
      }

      const tenant = this.registry.findByIssuer(issuer.replace(/\/$/, ''));
      if (!tenant) {
        // Deliberately not echoing the issuer back to the caller.
        this.logger.warn(`Rejected token from unknown issuer: ${issuer}`);
        throw new UnauthorizedException('Invalid or expired token');
      }
      return tenant;
    }

    // --- Unauthenticated: route by host (§1.2) ------------------------------
    // Only public data is reachable this way (the logged-out marketing
    // calculator), which is why a client-assertable signal is acceptable here
    // and nowhere else.
    const host = this.hostOf(req);
    if (host) {
      const byDomain = this.registry.findByDomain(host);
      if (byDomain) return byDomain;
    }

    // Single-tenant deployments commonly configure no domains at all. With
    // exactly one tenant there is nothing to choose between, so this is not a
    // guess — it is the only possibility. With several, refuse.
    if (this.registry.count() === 1) {
      return this.registry.all()[0];
    }

    this.logger.warn(`Could not resolve a tenant for host "${host ?? '(none)'}" on an unauthenticated request`);
    throw new NotFoundException('Unrecognised domain');
  }

  /** Prefer Origin (set on cross-site XHR) and fall back to Host. */
  private hostOf(req: Request): string | null {
    const origin = req.headers['origin'];
    if (typeof origin === 'string' && origin) {
      try {
        return new URL(origin).hostname.toLowerCase();
      } catch {
        /* fall through to Host */
      }
    }
    const host = req.headers['host'];
    if (typeof host === 'string' && host) {
      return host.split(':')[0].toLowerCase();
    }
    return null;
  }
}
