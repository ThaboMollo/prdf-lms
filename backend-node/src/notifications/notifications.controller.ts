import { Controller, Get, Post, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { NotificationsService } from './notifications.service';

@Controller('api/notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@GetCurrentUser() u: CurrentUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.svc.list(u, unreadOnly === 'true');
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@GetCurrentUser() u: CurrentUser, @Param('id') id: string) {
    await this.svc.markRead(u, id);
  }
}
