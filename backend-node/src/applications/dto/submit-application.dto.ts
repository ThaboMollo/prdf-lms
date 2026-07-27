import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SubmitApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
