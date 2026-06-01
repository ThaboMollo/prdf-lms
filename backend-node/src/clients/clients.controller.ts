import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ClientsService } from './clients.service';

@Controller('api/clients')
@UseGuards(SupabaseAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('assisted')
  createAssisted(@GetCurrentUser() user: CurrentUser, @Body() body: any) {
    return this.clientsService.createAssistedClient(user, body);
  }

  @Post(':id/invite')
  sendInvite(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.clientsService.sendInvite(user, id, body);
  }
}
