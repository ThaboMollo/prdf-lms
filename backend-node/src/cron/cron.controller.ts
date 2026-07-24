import { All, Controller, HttpCode, Logger, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../auth/cron-secret.guard';
import { NotificationsService } from '../notifications/notifications.service';

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

  constructor(private readonly notificationsService: NotificationsService) {}

  @All('notification-sweep')
  @HttpCode(200)
  async notificationSweep() {
    this.logger.log('Running notification sweep...');
    await this.notificationsService.runReminderScans();
    this.logger.log('Notification sweep complete.');
    return { ok: true };
  }
}
