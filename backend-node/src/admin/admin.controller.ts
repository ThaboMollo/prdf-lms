import { Controller, Get, Post, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('api/admin/users')
@UseGuards(SupabaseAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('access')
  listAccess(
    @GetCurrentUser() user: CurrentUser,
    @Query('filter') filter?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUserAccess(user, { filter, role, search });
  }

  @Post(':userId/roles/:roleName')
  assignRole(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string, @Param('roleName') roleName: string) {
    return this.adminService.assignRole(user, userId, roleName);
  }

  /**
   * The only recovery path from an MFA lockout — see AdminService.resetMfa.
   * SuperAdmin only.
   */
  @Delete(':userId/mfa')
  resetMfa(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string) {
    return this.adminService.resetMfa(user, userId);
  }

  @Delete(':userId/roles/:roleName')
  removeRole(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string, @Param('roleName') roleName: string) {
    return this.adminService.removeRole(user, userId, roleName);
  }
}
