import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAssistedClientDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  businessName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  applicantEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicantFullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redirectTo?: string;
}
