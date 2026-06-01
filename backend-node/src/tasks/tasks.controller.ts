import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { TasksService } from './tasks.service';

@Controller('api/tasks')
@UseGuards(SupabaseAuthGuard)
export class TasksController {
  constructor(private readonly svc: TasksService) {}

  @Get()
  list(@GetCurrentUser() u: CurrentUser, @Query('applicationId') appId?: string, @Query('assignedToMe') atm?: string) {
    return this.svc.list(u, appId, atm === 'true');
  }

  @Post()
  create(@GetCurrentUser() u: CurrentUser, @Body() body: any) { return this.svc.create(u, body); }

  @Put(':id')
  update(@GetCurrentUser() u: CurrentUser, @Param('id') id: string, @Body() body: any) { return this.svc.update(u, id, body); }

  @Post(':id/complete')
  complete(@GetCurrentUser() u: CurrentUser, @Param('id') id: string, @Body() body: any) { return this.svc.complete(u, id, body?.note); }
}
