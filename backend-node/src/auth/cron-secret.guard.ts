import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';

/**
 * Deliberately separate from SupabaseAuthGuard, not a shared guard with a
 * bypass flag: this must reject every normal user JWT and accept only the
 * cron secret. Does not set request.jwtClaims/request.user, so
 * RlsTransactionInterceptor correctly skips RLS transaction wrapping for
 * this route — the sweep legitimately needs unrestricted access across all
 * users' data, which is why it goes through this endpoint at all rather
 * than a user-scoped one.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      // A missing CRON_SECRET is a deployment fault, not a caller error, so it
      // must alert rather than answer. Thrown as an explicit 500: the message
      // used to contain "required", which the filter's substring rules matched
      // as a 400 — telling an unauthenticated prober that the secret is not
      // configured, and never raising the alert that would get it fixed.
      new Logger(CronSecretGuard.name).error(
        'CRON_SECRET is not set — internal cron endpoints cannot authenticate callers.',
      );
      throw new InternalServerErrorException();
    }
    if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== secret) {
      throw new UnauthorizedException('Invalid cron secret');
    }

    return true;
  }
}
