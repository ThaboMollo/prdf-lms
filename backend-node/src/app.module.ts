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
   * Tenant resolution runs before guards on every tenant-scoped route
   * (docs/multi-tenant-spec.md §1).
   *
   * Two routes are deliberately excluded because they are infrastructure, not
   * tenant data:
   *
   *   /health          — a static liveness response that touches nothing.
   *                      Requiring a tenant here made the API unmonitorable
   *                      once more than one tenant was configured: the probe
   *                      has no token and its host is not a tenant domain, so
   *                      it 404'd. Caught by the step-5 isolation suite.
   *
   *   /internal/cron/* — sweeps every tenant in turn and establishes its own
   *                      context per tenant (see W5).
   *
   * Excluding them is safe rather than a loophole: neither has a tenant in
   * context, so any attempt to touch the database from them throws in
   * currentTenant() rather than silently using a default (§4, invariant 5).
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantResolverMiddleware)
      .exclude('health', 'internal/cron/(.*)')
      .forRoutes('*');
  }
}
