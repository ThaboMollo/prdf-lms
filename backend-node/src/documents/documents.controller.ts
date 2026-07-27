import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { DocumentsService } from './documents.service';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';

@ApiTags('documents')
@Controller('api')
@UseGuards(SupabaseAuthGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get('document-requirements')
  list(@GetCurrentUser() u: CurrentUser, @Query('productId') productId?: string) {
    return this.svc.listRequirements(u, productId);
  }

  @Post('document-requirements')
  create(@GetCurrentUser() u: CurrentUser, @Body() body: CreateRequirementDto) { return this.svc.createRequirement(u, body); }

  @Post('applications/:appId/documents/:docId/verify')
  @HttpCode(204)
  async verify(@GetCurrentUser() u: CurrentUser, @Param('appId') appId: string, @Param('docId') docId: string, @Body() body: VerifyDocumentDto) {
    await this.svc.verifyDocument(u, appId, docId, body.status, body.note);
  }

  @Delete('applications/:appId/documents/:docId')
  @HttpCode(204)
  async deleteDocument(@GetCurrentUser() u: CurrentUser, @Param('appId') appId: string, @Param('docId') docId: string) {
    await this.svc.deleteDocument(u, appId, docId);
  }

  @Get('applications/:appId/documents/:docId/url')
  async getSignedUrl(@GetCurrentUser() u: CurrentUser, @Param('appId') appId: string, @Param('docId') docId: string) {
    return { url: await this.svc.getSignedDownloadUrl(u, appId, docId) };
  }
}
