import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import type { RiskGrade } from '../../common/pricing';

const RISK_GRADES: RiskGrade[] = ['Low', 'Moderate', 'High', 'Worst'];

export class QuoteDto {
  @ApiProperty({ description: 'Loan principal in Rand.' })
  @IsNumber()
  @IsPositive()
  principal!: number;

  @ApiProperty({ description: 'Days financed (maturity term in days).' })
  @IsInt()
  @IsPositive()
  daysFinanced!: number;

  @ApiProperty({ enum: RISK_GRADES, description: 'Risk grade set by the Risk Analyst.' })
  @IsIn(RISK_GRADES)
  riskGrade!: RiskGrade;

  @ApiPropertyOptional({ description: 'Days past maturity. Omit or 0 for an on-time quote.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  daysLate?: number;
}
