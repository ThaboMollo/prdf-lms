import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { AuthModule } from '../auth/auth.module';
import { LoanProductsModule } from '../loan-products/loan-products.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [AuthModule, LoanProductsModule, PricingModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
