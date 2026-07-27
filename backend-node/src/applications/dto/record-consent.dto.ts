import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MinLength } from 'class-validator';

export class RecordConsentDto {
  @ApiProperty({ description: 'Consent copy/version identifier, e.g. "2026-07-01".' })
  @IsString()
  @MinLength(1)
  version!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  items!: Record<string, unknown>;
}
