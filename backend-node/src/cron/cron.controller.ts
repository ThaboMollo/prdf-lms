import { All, Controller, HttpCode, HttpException, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../auth/cron-secret.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantRegistryService } from '../tenancy/tenant-registry.service';
import { runForTenant } from '../tenancy/request-context';
import * as Sentry from '@sentry/node';

type TenantSweepResult =
  | { slug: string; ok: true; created: { arrears: number; tasks: number; staleApplications: number } }
  | { slug: string; ok: false; error: string };

// Accepts any HTTP method via @All(): Vercel's own documentation is
// inconsistent about which method Cron actually sends (historically GET,
// some current docs say POST) — guessing wrong here would silently
// recreate the exact "cron never fires" problem this endpoint exists to
// fix. (Stacking @Post()+@Get() on one handler does NOT register both
// routes in NestJS — confirmed by testing; only the last decorator wins.
// @All() is the correct way to accept every method on one handler.)
@Controller('internal/cron')
@UseGuards(CronSecretGuard)
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly registry: TenantRegistryService,
  ) {}

  /**
   * Runs the reminder sweep for every tenant (docs/multi-tenant-spec.md §W5).
   *
   * This route is excluded from TenantResolverMiddleware — it belongs to no
   * single tenant, so it establishes context explicitly per tenant via
   * runForTenant().
   *
   * Two properties it must have, both learned the hard way:
   *
   *   Per-tenant isolation. One tenant's database being unreachable must not
   *   stop the others being swept, so each is wrapped separately.
   *
   *   No silent success. It reports what it actually created per tenant and
   *   returns non-2xx if ANY tenant failed. Returning 200 with the failure
   *   buried in the body is precisely how this endpoint sat green for months
   *   while never reaching the API at all — a scheduled job that cannot fail
   *   visibly is not a scheduled job.
   */
  @All('notification-sweep')
  @HttpCode(200)
  async notificationSweep() {
    const tenants = this.registry.all();
    this.logger.log(`Running notification sweep across ${tenants.length} tenant(s)...`);

    const results: TenantSweepResult[] = [];

    for (const tenant of tenants) {
      try {
        // The sweep runs outside a request, so TenantResolverMiddleware's
        // isolation scope doesn't apply — tag each tenant's pass separately or
        // a failure lands in Sentry with no indication of whose it was.
        const created = await Sentry.withIsolationScope(async (scope) => {
          scope.setTag('tenant', tenant.slug);
          scope.setTag('job', 'notification-sweep');
          return runForTenant(tenant, () => this.notificationsService.runReminderScans());
        });
        results.push({ slug: tenant.slug, ok: true, created });
        this.logger.log(
          `[${tenant.slug}] swept: ${created.arrears} arrears, ${created.tasks} task, ` +
            `${created.staleApplications} stale-application notification(s) created`,
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.push({ slug: tenant.slug, ok: false, error });
        // Logged at error level so it reaches Sentry/Vercel logs even though
        // the loop deliberately continues.
        this.logger.error(`[${tenant.slug}] sweep FAILED: ${error}`);
      }
    }

    const failed = results.filter((r) => !r.ok);
    const totals = results.reduce(
      (acc, r) =>
        r.ok
          ? {
              arrears: acc.arrears + r.created.arrears,
              tasks: acc.tasks + r.created.tasks,
              staleApplications: acc.staleApplications + r.created.staleApplications,
            }
          : acc,
      { arrears: 0, tasks: 0, staleApplications: 0 },
    );

    const body = {
      ok: failed.length === 0,
      tenants: results,
      totals,
      sweptAt: new Date().toISOString(),
    };

    if (failed.length > 0) {
      this.logger.error(`Notification sweep completed with ${failed.length} failed tenant(s).`);
      // Non-2xx on purpose: the scheduled caller asserts a 200, so a partial
      // failure must fail the job rather than hide inside a 200 body.
      throw new HttpException(body, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    this.logger.log('Notification sweep complete.');
    return body;
  }
}
