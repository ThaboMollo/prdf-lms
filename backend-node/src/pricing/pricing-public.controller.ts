import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';

/**
 * The one unauthenticated pricing route, kept in its own controller rather
 * than added to PricingController.
 *
 * PricingController carries a class-level SupabaseAuthGuard and every route on
 * it is staff-only (POST /quote additionally calls ensureInternal). Hanging a
 * public route off it would mean deleting that class-level guard and trusting
 * every future route to re-add it per-method — the exact footgun called out in
 * LoanProductsController's header. A separate controller makes "public" a
 * property of the file, not of a decorator someone has to remember.
 *
 * Returns only fee structure + the best-case rate (see PricingService
 * .publicConfig), which is what the logged-out LoanCalculator needs to quote
 * from the same engine the admin case page uses.
 */
@ApiTags('pricing')
@Controller('api/pricing')
export class PricingPublicController {
  constructor(private readonly svc: PricingService) {}

  @Get('public-config')
  publicConfig() {
    return this.svc.publicConfig();
  }
}
