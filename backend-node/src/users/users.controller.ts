import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('api/users')
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('assignable')
  listAssignable(@GetCurrentUser() user: CurrentUser) {
    return this.svc.listAssignable(user);
  }

  @Get('profiles')
  getProfiles(@GetCurrentUser() user: CurrentUser, @Query('ids') ids?: string) {
    const parsed = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.svc.getProfiles(user, parsed);
  }
}
