import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendInviteDto {
  @ApiProperty()
  @IsEmail()
  applicantEmail!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicantFullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redirectTo?: string;
}
