import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, defer, firstValueFrom } from 'rxjs';
import { DatabaseService } from './database.service';
import { rlsContext } from './rls-context';

/**
 * Defense in depth: opens a transaction per request, sets the caller's JWT
 * claims and switches to the `authenticated` Postgres role for the duration
 * of that transaction, so RLS applies to every query the request makes —
 * not just application-code role checks. A bug in either layer alone does
 * not produce a data breach.
 *
 * Runs after SupabaseAuthGuard (interceptors execute after guards in Nest's
 * request lifecycle), which stashes the verified JWT payload on
 * `request.jwtClaims`. Routes with no verified JWT (health check, the
 * cron-secret-guarded internal endpoint) skip the transaction entirely and
 * fall through to DatabaseService's raw-pool path — appropriate for the
 * cron sweep, which legitimately needs unrestricted access across all
 * users' data.
 *
 * Verified against the real Supabase project before relying on this: the
 * `postgres` role (SUPABASE_DB_CONNECTION_STRING's role) is not a
 * superuser, but IS a member of `authenticated`
 * (`pg_has_role('postgres','authenticated','MEMBER')` = true), so
 * `SET LOCAL ROLE authenticated` works with the connection exactly as
 * configured — no new role/grant was needed.
 */
@Injectable()
export class RlsTransactionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsTransactionInterceptor.name);

  constructor(private readonly db: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const jwtClaims = request.jwtClaims;

    if (!jwtClaims) {
      return next.handle();
    }

    return defer(async () => {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        // Transaction-local (`true` third arg) — required for Supavisor
        // transaction-mode pooling, which doesn't support session-level
        // state. Must execute inside the same transaction as the queries
        // it's meant to scope, which rlsContext.run below guarantees.
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(jwtClaims),
        ]);
        await client.query('set local role authenticated');

        const result = await rlsContext.run(client, () => firstValueFrom(next.handle()));

        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          this.logger.error('Rollback failed', rollbackErr as Error);
        }
        throw err;
      } finally {
        client.release();
      }
    });
  }
}
