import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateNfsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  supportType!: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  durationHours!: number;

  @ApiProperty()
  @IsDateString()
  dateProvided!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
