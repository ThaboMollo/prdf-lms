import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  docType!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fileName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentType?: string;
}
