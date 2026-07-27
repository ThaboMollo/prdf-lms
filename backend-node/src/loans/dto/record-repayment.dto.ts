import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RecordRepaymentDto {
  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: 'ISO date-time; defaults to now if omitted.' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentReference?: string;
}
