import { Controller, Get, Post, Put, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ApplicationsService } from './applications.service';

@Controller('api/applications')
@UseGuards(SupabaseAuthGuard)
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Post()
  @HttpCode(201)
  create(@GetCurrentUser() user: CurrentUser, @Body() body: any) {
    return this.svc.create(user, body);
  }

  @Put(':id')
  update(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(user, id, body);
  }

  @Get()
  list(@GetCurrentUser() user: CurrentUser) {
    return this.svc.list(user);
  }

  @Get(':id')
  getOne(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.getOne(user, id);
  }

  @Post(':id/submit')
  submit(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.submit(user, id, body?.note ?? null);
  }

  @Post(':id/status')
  changeStatus(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.changeStatus(user, id, body.toStatus, body.note ?? null);
  }

  @Get(':id/history')
  history(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.getHistory(user, id);
  }

  @Get(':id/notes')
  listNotes(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.listNotes(user, id);
  }

  @Post(':id/notes')
  createNote(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.createNote(user, id, body.body);
  }

  @Post(':id/documents/presign-upload')
  presignUpload(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.presignUpload(user, id, body);
  }

  @Post(':id/documents/confirm')
  confirmUpload(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.confirmUpload(user, id, body);
  }

  @Get(':id/documents')
  listDocuments(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.listDocuments(user, id);
  }
}
