import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Max } from 'class-validator';
import { RiskGrade } from '../../common/pricing';

/**
 * The grade the Risk Analyst assigns at Due Diligence.
 *
 * The allowed values mirror risk_grades.grade. Validated against the literal
 * list rather than a lookup so an unknown grade is a 400 at the edge; whether
 * the grade is still ACTIVE is checked by PricingService.loadMargin() when the
 * loan is booked.
 */
export const RISK_GRADES: RiskGrade[] = ['Low', 'Moderate', 'High', 'Worst'];

export class SetRiskGradeDto {
  @ApiProperty({ enum: RISK_GRADES, description: 'Risk grade driving the booked annual rate (prime + margin).' })
  @IsIn(RISK_GRADES)
  riskGrade!: RiskGrade;

  /**
   * Annual rate (% p.a.) keyed in at Due Diligence; overrides prime + margin at
   * booking. null clears it; omitting it leaves any stored override untouched
   * (the Pricing tab saves the grade alone).
   */
  @ApiPropertyOptional({ nullable: true, description: 'Interest rate override, % p.a. (0 < rate <= 100). null clears it.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Max(100)
  interestRatePct?: number | null;
}
