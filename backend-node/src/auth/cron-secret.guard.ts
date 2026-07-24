import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

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
      throw new Error('CRON_SECRET is required to use the internal cron endpoints');
    }
    if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== secret) {
      throw new UnauthorizedException('Invalid cron secret');
    }

    return true;
  }
}
