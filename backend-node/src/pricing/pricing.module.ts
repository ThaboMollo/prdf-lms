import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingPublicController } from './pricing-public.controller';
import { PricingService } from './pricing.service';
import { AuthModule } from '../auth/auth.module';

// PricingService is exported because ApplicationsService books loans off it:
// the grade the Risk Analyst saves drives the booked rate, days financed and
// fees (see ensureLoanCreatedForApproved).
@Module({
  imports: [AuthModule],
  controllers: [PricingController, PricingPublicController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
