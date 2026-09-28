import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ConfirmUploadDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  docType!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  storagePath!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  /**
   * The document_requests row this upload answers, when the applicant uploaded
   * from a request rather than the standing checklist. Marks that request
   * fulfilled in the same transaction.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  documentRequestId?: string;
}
