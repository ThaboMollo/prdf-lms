import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureInternal, fetchUserRoles } from '../auth/roles.helper';
import {
  PricingConfig,
  QuoteBreakdown,
  RiskGrade,
  RoundingMode,
  quote as computeQuote,
} from '../common/pricing';
import { QuoteDto } from './dto/quote.dto';

interface PricingConfigRow {
  primeRatePct: number;
  initiationFee: number;
  managementFeePct: number;
  penaltyRatePct: number;
  penaltyPeriodDays: number;
  daysPerYear: number;
  roundingMode: RoundingMode;
}

@Injectable()
export class PricingService {
  constructor(private readonly db: DatabaseService) {}

  private async loadConfig(): Promise<PricingConfig> {
    const row = await this.db.queryOne<PricingConfigRow>(
      `select prime_rate_pct::float8      as "primeRatePct",
              initiation_fee::float8      as "initiationFee",
              management_fee_pct::float8  as "managementFeePct",
              penalty_rate_pct::float8    as "penaltyRatePct",
              penalty_period_days         as "penaltyPeriodDays",
              days_per_year               as "daysPerYear",
              rounding_mode               as "roundingMode"
       from public.pricing_config
       limit 1`,
    );
    if (!row) {
      throw new BadRequestException('Pricing configuration has not been set up.');
    }
    return row;
  }

  private async loadMargin(grade: RiskGrade): Promise<number> {
    const row = await this.db.queryOne<{ marginPct: number }>(
      `select margin_pct::float8 as "marginPct"
       from public.risk_grades
       where grade = $1 and is_active = true`,
      [grade],
    );
    if (!row) {
      throw new BadRequestException(`Risk grade '${grade}' is not configured or is inactive.`);
    }
    return row.marginPct;
  }

  /**
   * Produce a full pricing breakdown for a set of inputs. Read-only — computes
   * from the current pricing_config + risk_grades and does not persist anything
   * (Phase 1 is the calculator; booking is Phase 2).
   */
  async quote(actor: CurrentUser, dto: QuoteDto): Promise<QuoteBreakdown> {
    ensureInternal(await fetchUserRoles(this.db, actor.userId));

    const config = await this.loadConfig();
    const marginPct = await this.loadMargin(dto.riskGrade);

    return computeQuote(config, {
      principal: dto.principal,
      daysFinanced: dto.daysFinanced,
      riskGrade: dto.riskGrade,
      marginPct,
      daysLate: dto.daysLate ?? 0,
    });
  }
}
