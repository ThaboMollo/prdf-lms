import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { RlsTransactionInterceptor } from './database/rls-transaction.interceptor';
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
import { NfsModule } from './nfs/nfs.module';
import { CronModule } from './cron/cron.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    NfsModule,
    CronModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsTransactionInterceptor,
    },
  ],
})
export class AppModule {}
