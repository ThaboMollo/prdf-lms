import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ClientsService } from './clients.service';
import { CreateAssistedClientDto } from './dto/create-assisted-client.dto';
import { SendInviteDto } from './dto/send-invite.dto';

@ApiTags('clients')
@Controller('api/clients')
@UseGuards(SupabaseAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('assisted')
  createAssisted(@GetCurrentUser() user: CurrentUser, @Body() body: CreateAssistedClientDto) {
    return this.clientsService.createAssistedClient(user, body);
  }

  @Post(':id/invite')
  sendInvite(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: SendInviteDto) {
    return this.clientsService.sendInvite(user, id, body);
  }
}
