import { Module } from '@nestjs/common';
import { NfsController } from './nfs.controller';
import { NfsService } from './nfs.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [NfsController], providers: [NfsService] })
export class NfsModule {}
