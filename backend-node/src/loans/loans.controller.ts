import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { LoansService } from './loans.service';
import { DisburseDto } from './dto/disburse.dto';
import { RecordRepaymentDto } from './dto/record-repayment.dto';

@ApiTags('loans')
@Controller('api/loans')
@UseGuards(SupabaseAuthGuard)
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  @Get()
  list(@GetCurrentUser() u: CurrentUser) { return this.svc.list(u); }

  @Get(':id')
  getById(@GetCurrentUser() u: CurrentUser, @Param('id') id: string) { return this.svc.getById(u, id); }

  @Post(':id/disburse')
  disburse(@GetCurrentUser() u: CurrentUser, @Param('id') id: string, @Body() body: DisburseDto) { return this.svc.disburse(u, id, body); }

  @Post(':id/repayments')
  recordRepayment(@GetCurrentUser() u: CurrentUser, @Param('id') id: string, @Body() body: RecordRepaymentDto) { return this.svc.recordRepayment(u, id, body); }
}
