import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
  @Get()
  me(@GetCurrentUser() user: CurrentUser) {
    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
    };
  }
}
