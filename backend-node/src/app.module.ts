import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { AdminModule } from './admin/admin.module';
import { ClientsModule } from './clients/clients.module';
import { ApplicationsModule } from './applications/applications.module';
import { LoansModule } from './loans/loans.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationSweepJob } from './jobs/notification-sweep.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminModule,
    ClientsModule,
    ApplicationsModule,
    LoansModule,
    TasksModule,
    DocumentsModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [HealthController, MeController],
  providers: [NotificationSweepJob],
})
export class AppModule {}
