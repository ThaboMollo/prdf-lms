import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { PricingService } from './pricing.service';
import { QuoteDto } from './dto/quote.dto';

@ApiTags('pricing')
@Controller('api/pricing')
@UseGuards(SupabaseAuthGuard)
export class PricingController {
  constructor(private readonly svc: PricingService) {}

  @Post('quote')
  quote(@GetCurrentUser() u: CurrentUser, @Body() body: QuoteDto) {
    return this.svc.quote(u, body);
  }
}
