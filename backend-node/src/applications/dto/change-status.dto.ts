import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const KNOWN_STATUSES = [
  'Draft',
  'Submitted',
  'UnderReview',
  'InfoRequested',
  'Approved',
  'Rejected',
  'Disbursed',
  'InRepayment',
  'Closed',
];

export class ChangeStatusDto {
  @ApiProperty({ enum: KNOWN_STATUSES })
  @IsIn(KNOWN_STATUSES)
  toStatus!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
