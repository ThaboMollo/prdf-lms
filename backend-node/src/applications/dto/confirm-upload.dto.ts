import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

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
}
