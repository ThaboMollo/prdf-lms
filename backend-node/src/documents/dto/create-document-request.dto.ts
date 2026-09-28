import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Must stay a subset of ALLOWED_DOCUMENT_EXTENSIONS in
 * ../../common/file-validation.ts — a reviewer must not be able to ask for a
 * file type the upload endpoint will then refuse.
 */
export const REQUESTABLE_FILE_TYPES = ['pdf', 'doc', 'docx', 'any'] as const;

export class CreateDocumentRequestDto {
  /** A checklist key (IDDocument, TaxClearance, …) or the literal 'Other'. */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  docType!: string;

  /** Required when docType is 'Other'; rejected otherwise (enforced in the service). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  @ApiPropertyOptional({ enum: REQUESTABLE_FILE_TYPES, default: 'pdf' })
  @IsOptional()
  @IsIn(REQUESTABLE_FILE_TYPES as unknown as string[])
  fileType?: string;
}
