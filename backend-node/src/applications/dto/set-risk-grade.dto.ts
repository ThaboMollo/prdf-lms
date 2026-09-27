import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
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
}
