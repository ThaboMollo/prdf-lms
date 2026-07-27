import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreateApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  requestedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  termMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessName?: string;

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
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyRevenue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsInOperation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfEmployees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  spatialType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @IsString()
  sarsTaxPin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  insolventOrDebtReview?: boolean;
}
