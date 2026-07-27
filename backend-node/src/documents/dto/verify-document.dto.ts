import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const VERIFICATION_STATUSES = ['Verified', 'Rejected'];

export class VerifyDocumentDto {
  @ApiProperty({ enum: VERIFICATION_STATUSES })
  @IsIn(VERIFICATION_STATUSES)
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
