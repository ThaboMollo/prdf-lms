import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoanProductsService } from './loan-products.service';

@ApiTags('loan-products')
@Controller('api/loan-products')
export class LoanProductsController {
  constructor(private readonly svc: LoanProductsService) {}

  /**
   * Deliberately public — no SupabaseAuthGuard. Mirrors the DB's own
   * anon-readable RLS scope exactly (is_active = true rows only), since
   * this backs the logged-out public marketing loan calculator
   * (client-ui's LandingPage/LoanCalculator). If more routes are added to
   * this controller later, they need the guard back individually — this
   * exemption is specific to "the one active product's public fields."
   */
  @Get('active')
  async getActive() {
    const product = await this.svc.getActiveProduct();
    if (!product) throw new NotFoundException('No active loan product is configured.');
    return product;
  }
}
