import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CronController],
})
export class CronModule {}
