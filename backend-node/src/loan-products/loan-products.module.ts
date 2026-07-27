import { Module } from '@nestjs/common';
import { LoanProductsController } from './loan-products.controller';
import { LoanProductsService } from './loan-products.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LoanProductsController],
  providers: [LoanProductsService],
  exports: [LoanProductsService],
})
export class LoanProductsModule {}
