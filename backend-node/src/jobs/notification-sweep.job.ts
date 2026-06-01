import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class NotificationSweepJob {
  private readonly logger = new Logger(NotificationSweepJob.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handle() {
    this.logger.log('Running notification sweep...');
    try {
      await this.notificationsService.runReminderScans();
      this.logger.log('Notification sweep complete.');
    } catch (err) {
      this.logger.error('Notification sweep failed', err);
    }
  }
}
