import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { RecordConsentDto } from './dto/record-consent.dto';

@ApiTags('applications')
@Controller('api/applications')
@UseGuards(SupabaseAuthGuard)
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Post()
  @HttpCode(201)
  create(@GetCurrentUser() user: CurrentUser, @Body() body: CreateApplicationDto) {
    return this.svc.create(user, body);
  }

  @Get()
  list(@GetCurrentUser() user: CurrentUser) {
    return this.svc.list(user);
  }

  // Must be registered before ':id' — otherwise "draft" would be matched
  // as an :id param value instead of this literal route.
  @Get('draft')
  getMyDraft(@GetCurrentUser() user: CurrentUser) {
    return this.svc.getMyDraft(user);
  }

  @Get(':id')
  getOne(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.getOne(user, id);
  }

  @Put(':id')
  update(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: UpdateApplicationDto) {
    return this.svc.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteApplication(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    await this.svc.deleteApplication(user, id);
  }

  @Post(':id/submit')
  submit(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: SubmitApplicationDto) {
    return this.svc.submit(user, id, body?.note ?? null);
  }

  @Post(':id/status')
  changeStatus(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: ChangeStatusDto) {
    return this.svc.changeStatus(user, id, body.toStatus, body.note ?? null);
  }

  @Post(':id/consent')
  @HttpCode(204)
  async recordConsent(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: RecordConsentDto) {
    await this.svc.recordConsent(user, id, body);
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
  createNote(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: CreateNoteDto) {
    return this.svc.createNote(user, id, body.body);
  }

  @Post(':id/documents/presign-upload')
  presignUpload(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: PresignUploadDto) {
    return this.svc.presignUpload(user, id, body);
  }

  @Post(':id/documents/confirm')
  confirmUpload(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: ConfirmUploadDto) {
    return this.svc.confirmUpload(user, id, body);
  }

  @Get(':id/documents')
  listDocuments(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.listDocuments(user, id);
  }
}
