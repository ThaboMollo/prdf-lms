import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One acknowledged consent statement.
 *
 * Mirrors ConsentAnswer in packages/domain/consent.ts, which is what BOTH
 * front ends build their payload from (client-ui's ConsentModal and admin-ui's
 * staff-assisted flow). The four properties below are exactly what they send —
 * `forbidNonWhitelisted` is on, so anything extra is rejected rather than
 * silently dropped.
 */
export class ConsentItemDto {
  @ApiProperty({ description: 'Stable key for the statement, e.g. "popia_processing".' })
  @IsString()
  @MinLength(1)
  key!: string;

  @ApiProperty({ description: 'Grouping: POPIA, Policy or Terms.' })
  @IsString()
  @MinLength(1)
  section!: string;

  @ApiProperty({ description: 'The statement as it was shown to the applicant.' })
  @IsString()
  @MinLength(1)
  prompt!: string;

  @ApiProperty({ description: 'Always true — an applicant cannot proceed without acknowledging every item.' })
  @IsBoolean()
  answer!: boolean;
}

export class RecordConsentDto {
  @ApiProperty({ description: 'Consent copy/version identifier, e.g. "2026-07-16".' })
  @IsString()
  @MinLength(1)
  version!: string;

  /**
   * An ARRAY, not an object.
   *
   * This was previously `@IsObject() Record<string, unknown>`, which
   * class-validator rejects for arrays (it checks !Array.isArray). Both front
   * ends have always sent `ConsentAnswer[]`, so every submission failed with
   * "items must be an object" — the applicant reached the last step, answered
   * all twelve statements, pressed Proceed, and the application was never
   * submitted. The seeded applications were inserted by SQL, which is why this
   * was not caught earlier.
   *
   * The service writes `JSON.stringify(body.items)` into a jsonb column, which
   * stores an array just as happily as an object; nothing downstream needed to
   * change.
   */
  @ApiProperty({ type: () => [ConsentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  items!: ConsentItemDto[];
}
