import { Controller, Get, Post, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { AdminService } from './admin.service';

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

  @Post(':userId/roles/admin')
  grantAdmin(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string) {
    return this.adminService.grantAdmin(user, userId);
  }

  @Delete(':userId/roles/admin')
  revokeAdmin(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string) {
    return this.adminService.revokeAdmin(user, userId);
  }
}
