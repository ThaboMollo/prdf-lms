import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantResolverMiddleware } from './tenancy/tenant-resolver.middleware';
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
import { LoanProductsModule } from './loan-products/loan-products.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TenancyModule,
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
    LoanProductsModule,
    UsersModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsTransactionInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Tenant resolution runs before guards on EVERY route, including the health
   * check and the cron endpoint — a route that reaches the database without a
   * tenant in context should fail loudly rather than fall back to a default
   * (docs/multi-tenant-spec.md §4, invariant 5).
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
