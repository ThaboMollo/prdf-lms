import { Controller, Get, Post, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { DocumentsService } from './documents.service';

@Controller('api')
@UseGuards(SupabaseAuthGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get('document-requirements')
  list(@GetCurrentUser() u: CurrentUser) { return this.svc.listRequirements(u); }

  @Post('document-requirements')
  create(@GetCurrentUser() u: CurrentUser, @Body() body: any) { return this.svc.createRequirement(u, body); }

  @Post('applications/:appId/documents/:docId/verify')
  @HttpCode(204)
  async verify(@GetCurrentUser() u: CurrentUser, @Param('appId') appId: string, @Param('docId') docId: string, @Body() body: any) {
    await this.svc.verifyDocument(u, appId, docId, body.status, body.note);
  }
}
