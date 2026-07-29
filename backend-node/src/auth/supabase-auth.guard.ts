import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { DatabaseService } from '../database/database.service';
import { currentTenant } from '../tenancy/request-context';
import { CurrentUser, fetchUserRoles, ensureMfaSatisfied } from './roles.helper';

// jose is pinned to v4 deliberately. v4 publishes a "require" export
// condition (real CommonJS); v5+ is ESM-only.
//
// The previous approach imported jose v6 through
// `new Function('specifier', 'return import(specifier)')` to stop tsc
// downlevelling the dynamic import() into a require() and throwing
// ERR_REQUIRE_ESM. It worked locally — and broke production completely.
// Vercel's file tracer (@vercel/nft) decides what to include in the lambda by
// statically scanning for require()/import(). Hiding the import from tsc also
// hid it from nft, so jose was never deployed. Every authenticated request
// then failed inside the guard with "Cannot find package 'jose'", which the
// catch below reported as "Invalid or expired token" — a misleading 401 that
// looked like an auth problem for days.
//
// A plain static import on a CJS-capable version avoids both traps: tsc emits
// require('jose'), Node loads it synchronously, and nft sees the reference and
// bundles it.

// One key set PER TENANT, cached at module scope: jose fetches a JWKS once and
// caches/auto-refreshes it internally, so rebuilding per request would add a
// network round trip to every cold start.
//
// Keyed by issuer rather than slug because the issuer is what the token
// actually asserts, and it is what TenantResolverMiddleware routed on — using
// the same key in both places means there is no way for the two to disagree
// about which tenant a request belongs to.
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwksFor(issuer: string, supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksByIssuer.get(issuer);
  if (cached) return cached;

  const keySet = createRemoteJWKSet(
    new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
  );
  jwksByIssuer.set(issuer, keySet);
  return keySet;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice(7);

    let payload: JWTPayload;
    try {
      const audience = process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';
      // The tenant was resolved from this token's issuer by
      // TenantResolverMiddleware. Verifying against THAT tenant's key set is
      // what makes the earlier unverified decode safe: a forged issuer selects
      // a key set that cannot validate the signature.
      const tenant = currentTenant();
      const result = await jwtVerify(token, getJwksFor(tenant.issuer, tenant.supabaseUrl), {
        audience,
        issuer: tenant.issuer,
      });
      payload = result.payload;
    } catch (err) {
      this.logger.warn(`JWT verification failed: ${err instanceof Error ? err.message : err}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Token missing subject claim');
    }

    // Stash the raw verified claims for the RLS-behind-API interceptor
    // (set_config('request.jwt.claims', ...)) — needs the full payload, not
    // just what CurrentUser carries.
    request.jwtClaims = payload;

    const roles = await fetchUserRoles(this.db, userId);

    const profileRow = await this.db.queryOne<{ full_name: string | null }>(
      `select full_name from public.profiles where user_id = $1`,
      [userId],
    );

    const currentUser: CurrentUser = {
      userId,
      email: (payload.email as string | undefined) ?? '',
      fullName: profileRow?.full_name ?? null,
      roles,
      aal: payload.aal as string | undefined,
    };

    // Second-factor requirement for internal roles (§6.5). No-op unless
    // REQUIRE_MFA_FOR_STAFF=true. Enforced at the guard so it covers every
    // authenticated route, rather than relying on each service to remember.
    try {
      ensureMfaSatisfied(currentUser);
    } catch (err) {
      throw new UnauthorizedException(err instanceof Error ? err.message : 'MFA required');
    }

    request.user = currentUser;
    return true;
  }
}
