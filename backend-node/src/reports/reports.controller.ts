import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ReportsService } from './reports.service';

@ApiTags('reports')
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
  @Get('pipeline-summary') pipelineSummary(@GetCurrentUser() u: CurrentUser, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) { return this.svc.pipelineSummary(u, startDate, endDate); }
  @Get('origination-trends') originationTrends(@GetCurrentUser() u: CurrentUser, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) { return this.svc.originationTrends(u, startDate, endDate); }
  @Get('demographic') demographic(@GetCurrentUser() u: CurrentUser) { return this.svc.demographic(u); }
  @Get('debtors-age') debtorsAge(@GetCurrentUser() u: CurrentUser) { return this.svc.debtorsAge(u); }
  @Get('province') province(@GetCurrentUser() u: CurrentUser) { return this.svc.province(u); }
}
