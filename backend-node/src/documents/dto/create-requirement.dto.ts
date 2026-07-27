import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  loanProductId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  requiredAtStatus!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  docType!: string;

  @ApiProperty()
  @IsBoolean()
  isRequired!: boolean;
}
