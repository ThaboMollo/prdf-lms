import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { LoanProductsService } from './loan-products.service';

@ApiTags('loan-products')
@Controller('api/loan-products')
@UseGuards(SupabaseAuthGuard)
export class LoanProductsController {
  constructor(private readonly svc: LoanProductsService) {}

  @Get('active')
  async getActive() {
    const product = await this.svc.getActiveProduct();
    if (!product) throw new NotFoundException('No active loan product is configured.');
    return product;
  }
}
