import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ReportsService } from './reports.service';

@Controller('api/reports')
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('portfolio') portfolio(@GetCurrentUser() u: CurrentUser) { return this.svc.portfolio(u); }
  @Get('arrears') arrears(@GetCurrentUser() u: CurrentUser) { return this.svc.arrears(u); }
  @Get('audit') audit(@GetCurrentUser() u: CurrentUser, @Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) { return this.svc.audit(u, from, to, limit ? parseInt(limit) : 200); }
  @Get('turnaround') turnaround(@GetCurrentUser() u: CurrentUser) { return this.svc.turnaround(u); }
  @Get('pipeline-conversion') pipelineConversion(@GetCurrentUser() u: CurrentUser) { return this.svc.pipelineConversion(u); }
  @Get('productivity') productivity(@GetCurrentUser() u: CurrentUser) { return this.svc.productivity(u); }
}
