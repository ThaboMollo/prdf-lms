import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingPublicController } from './pricing-public.controller';
import { PricingService } from './pricing.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [PricingController, PricingPublicController], providers: [PricingService] })
export class PricingModule {}
