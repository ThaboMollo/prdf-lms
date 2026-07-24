import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { RlsTransactionInterceptor } from './rls-transaction.interceptor';

@Global()
@Module({
  providers: [DatabaseService, RlsTransactionInterceptor],
  exports: [DatabaseService, RlsTransactionInterceptor],
})
export class DatabaseModule {}
