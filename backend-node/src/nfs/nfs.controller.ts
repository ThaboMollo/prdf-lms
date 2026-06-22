import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { NfsService } from './nfs.service';

@Controller('api/clients/:clientId/nfs')
@UseGuards(SupabaseAuthGuard)
export class NfsController {
  constructor(private readonly svc: NfsService) {}

  @Get()
  list(@GetCurrentUser() u: CurrentUser, @Param('clientId') clientId: string) {
    return this.svc.list(u, clientId);
  }

  @Post()
  create(@GetCurrentUser() u: CurrentUser, @Param('clientId') clientId: string, @Body() body: any) {
    return this.svc.create(u, clientId, body);
  }
}
