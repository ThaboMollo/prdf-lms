import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import {
  ACCEPTED_INDUSTRIES,
  GENDERS,
  LIMITS,
  SA_PROVINCES,
  SPATIAL_TYPES,
} from '../../common/generated-constraints';
import { AllowBlank } from '../../common/allow-blank.decorator';

/**
 * Rules here are generated from packages/domain/constraints.ts — the same
 * definition the wizard's zod schemas use (docs/validation-spec.md workstream
 * B). Do not hand-edit a limit; change the source and regenerate, or CI's
 * drift check fails.
 *
 * `@IsIn` messages are written out rather than left to class-validator, whose
 * default lists every accepted value — 19 industries in one sentence under an
 * input is not a usable error.
 */

export class CreateApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(LIMITS.requestedAmount.max, { message: 'Requested amount is implausibly large.' })
  requestedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(LIMITS.termMonths.min, { message: 'Term must be at least 1 month.' })
  @Max(LIMITS.termMonths.max, { message: 'Term is implausibly long.' })
  termMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @Length(LIMITS.purpose.minLength, LIMITS.purpose.maxLength, {
    message: `Purpose must be between ${LIMITS.purpose.minLength} and ${LIMITS.purpose.maxLength} characters.`,
  })
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @Length(LIMITS.businessName.minLength, LIMITS.businessName.maxLength, {
    message: 'Business name must be at least 2 characters.',
  })
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @Length(LIMITS.registrationNo.minLength, LIMITS.registrationNo.maxLength, {
    message: 'Registration number must be at least 4 characters.',
  })
  registrationNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(LIMITS.monthlyRevenue.min, { message: 'Monthly revenue must be greater than 0.' })
  @Max(LIMITS.monthlyRevenue.max, { message: 'Monthly revenue is implausibly large.' })
  monthlyRevenue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(LIMITS.yearsInOperation.min, { message: 'Years in operation cannot be negative.' })
  @Max(LIMITS.yearsInOperation.max, { message: 'Years in operation is implausibly large.' })
  yearsInOperation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(LIMITS.numberOfEmployees.min, { message: 'A business must have at least 1 employee.' })
  @Max(LIMITS.numberOfEmployees.max, { message: 'Number of employees is implausibly large.' })
  numberOfEmployees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @Length(LIMITS.bankName.minLength, LIMITS.bankName.maxLength, {
    message: 'Bank name must be at least 2 characters.',
  })
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  currentStep?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  draftState?: Record<string, unknown>;

  // BEE/demographic/compliance fields — live on the `clients` table, not
  // `loan_applications`. Persisted via ApplicationsService's client-profile
  // patch (mirrors client-ui's resolveClientId()), not a direct column
  // mapping on this DTO's own insert/update.
  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @IsIn(SA_PROVINCES, { message: 'Select a valid South African province.' })
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @IsIn(SPATIAL_TYPES, { message: 'Select where the business operates.' })
  spatialType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @IsIn(ACCEPTED_INDUSTRIES, { message: 'Select a valid industry.' })
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @IsIn(GENDERS, { message: 'Select a valid option.' })
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHdp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRural?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBlackWomenOwned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(LIMITS.saCitizenshipPercentage.min, { message: 'Percentage cannot be negative.' })
  @Max(LIMITS.saCitizenshipPercentage.max, { message: 'Percentage cannot exceed 100.' })
  saCitizenshipPercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDirectorOperational?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cipcRegistered?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @AllowBlank()
  @IsString()
  @Length(LIMITS.sarsTaxPin.minLength, LIMITS.sarsTaxPin.maxLength, {
    message: 'SARS tax PIN must be at least 5 characters.',
  })
  sarsTaxPin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  insolventOrDebtReview?: boolean;
}
