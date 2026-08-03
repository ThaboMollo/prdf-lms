import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { MeService } from './me.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('me')
@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
  constructor(private readonly svc: MeService) {}

  @Get()
  async me(@GetCurrentUser() user: CurrentUser) {
    const profile = await this.svc.getProfile(user.userId);
    return {
      userId: user.userId,
      email: user.email,
      // Prefer the freshly-read profile name so the app reflects an edit
      // immediately; fall back to the token-derived name.
      fullName: profile.fullName ?? user.fullName,
      phone: profile.phone,
      roles: user.roles,
    };
  }

  @Patch('profile')
  updateProfile(@GetCurrentUser() user: CurrentUser, @Body() body: UpdateProfileDto) {
    return this.svc.updateProfile(user.userId, body);
  }
}
