import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  // ApplicationsService links an upload to the request that asked for it.
  exports: [DocumentsService],
})
export class DocumentsModule {}
