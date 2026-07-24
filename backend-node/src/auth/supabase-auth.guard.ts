import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { createRemoteJWKSet, JWTPayload } from 'jose';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, fetchUserRoles } from './roles.helper';

// jose v6 ships ESM-only (no "require" export condition) — a static
// `import ... from 'jose'` compiles to `require('jose')` under this
// project's CommonJS output and throws ERR_REQUIRE_ESM in Vercel's function
// runtime (it worked locally only because that Node build happens to support
// synchronous require(esm)). A literal `await import('jose')` doesn't fix
// this either — tsc downlevels dynamic import() to a require() wrapped in
// Promise.resolve() when the target module is CommonJS, hitting the same
// error. Routing through `new Function` hides the import() from tsc's
// static transform entirely, so the emitted code calls Node's real
// asynchronous ESM loader instead.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('jose')>;

let joseModule: typeof import('jose') | null = null;

async function getJose(): Promise<typeof import('jose')> {
  if (!joseModule) joseModule = await dynamicImport('jose');
  return joseModule;
}

// Module-scope, not per-guard-instance or per-request: jose fetches the JWKS
// once and caches/auto-refreshes it internally. Constructing this inside the
// class (or per-request) would re-fetch the key set unnecessarily — on
// serverless this matters more, not less, since a cold function paying an
// extra network round trip on top of its cold start is a visibly slow first
// request.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
  if (jwks) return jwks;
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is required');
  const { createRemoteJWKSet } = await getJose();
  jwks = createRemoteJWKSet(new URL(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`));
  return jwks;
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
      const { jwtVerify } = await getJose();
      const result = await jwtVerify(token, await getJwks(), { audience });
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
    };

    request.user = currentUser;
    return true;
  }
}
