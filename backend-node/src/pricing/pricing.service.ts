import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureInternal, fetchUserRoles } from '../auth/roles.helper';
import {
  PricingConfig,
  QuoteBreakdown,
  RiskGrade,
  RoundingMode,
  annualRate,
  quote as computeQuote,
  round2,
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

/**
 * The subset of the pricing model the logged-out client portal may see.
 *
 * Still NOT the whole risk-grade ladder — the individual grades and their
 * names stay internal — but it does carry both ends of the margin spread.
 * The hero calculator discloses the ceiling ("Prime + up to 10.50%") so an
 * applicant is told the worst case up front, while the worked figures beside
 * it are quoted at the floor. Publishing only the floor, as this first did,
 * would have advertised a rate with no stated upper bound.
 */
export interface PublicPricingConfig extends PricingConfig {
  /** Grade the indicative rate is based on — the cheapest active one. */
  indicativeGrade: RiskGrade;
  indicativeMarginPct: number;
  /** primeRatePct + indicativeMarginPct, precomputed for display. */
  indicativeAnnualRatePct: number;
  /** Dearest active margin — the "+ up to X%" half of the rate disclosure. */
  maxMarginPct: number;
  /** primeRatePct + maxMarginPct: the most an applicant can be charged. */
  maxAnnualRatePct: number;
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
   * Fee structure + best-case rate for the public client-portal calculator.
   *
   * Unauthenticated by design (see PricingPublicController). Note this runs on
   * DatabaseService's raw tenant pool rather than an RLS-scoped transaction —
   * RlsTransactionInterceptor only opens one when the request carries verified
   * JWT claims — so pricing_config's internal-read policy does not apply here.
   * That is exactly why this method hand-picks its fields instead of returning
   * the row: the narrowing is the access control.
   */
  async publicConfig(): Promise<PublicPricingConfig> {
    const config = await this.loadConfig();
    // Both ends of the spread in one round trip — the ladder itself is read
    // but never returned, only its first and last margin.
    const grades = await this.db.query<{ grade: RiskGrade; marginPct: number }>(
      `select grade, margin_pct::float8 as "marginPct"
         from public.risk_grades
        where is_active = true
        order by margin_pct asc`,
    );
    if (grades.length === 0) {
      throw new BadRequestException('No active risk grade is configured.');
    }

    const best = grades[0];
    const worst = grades[grades.length - 1];

    return {
      ...config,
      indicativeGrade: best.grade,
      indicativeMarginPct: best.marginPct,
      indicativeAnnualRatePct: annualRate(config, best.marginPct),
      maxMarginPct: worst.marginPct,
      maxAnnualRatePct: annualRate(config, worst.marginPct),
    };
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

  /**
   * Months -> days, matching the client portal's conversion exactly
   * (client-ui/src/lib/creditQuote.ts). A calendar month is daysPerYear / 12,
   * so a stated 12 months is worth exactly one year of interest at the annual
   * rate and lands on the spreadsheet's 365 / 730 / 1095-day rows.
   */
  monthsToDays(months: number, daysPerYear: number): number {
    return Math.round(months * (daysPerYear / 12));
  }

  /**
   * Everything needed to BOOK a loan, as opposed to preview one.
   *
   * Phase 2 (docs/credit-model-phase1-plan.md §10). The booked rate is
   * prime + the margin of the grade the Risk Analyst set at Due Diligence —
   * not loan_products.interest_rate, which is the legacy flat 18.5% and was
   * what every loan was silently booked at before this.
   *
   * No actor/role check: this is called from the application status machine
   * when a case reaches Approved, not from a request handler.
   */
  async bookingTerms(input: {
    principal: number;
    termMonths: number;
    riskGrade: RiskGrade;
  }): Promise<{
    annualRatePct: number;
    daysFinanced: number;
    interest: number;
    initiationFee: number;
    managementFee: number;
    totalFees: number;
    /** Principal + interest. What the client repays at maturity. */
    totalDueToFunder: number;
    /** Principal less the once-off fees. What the client actually receives. */
    netAdvance: number;
  }> {
    const config = await this.loadConfig();
    const marginPct = await this.loadMargin(input.riskGrade);
    const daysFinanced = this.monthsToDays(input.termMonths, config.daysPerYear);

    const breakdown = computeQuote(config, {
      principal: input.principal,
      daysFinanced,
      riskGrade: input.riskGrade,
      marginPct,
      daysLate: 0,
    });

    return {
      annualRatePct: annualRate(config, marginPct),
      daysFinanced,
      interest: breakdown.interest,
      initiationFee: breakdown.initiationFee,
      managementFee: breakdown.managementFee,
      totalFees: breakdown.totalFees,
      totalDueToFunder: breakdown.totalDueToFunder,
      netAdvance: round2(input.principal - breakdown.totalFees, config.roundingMode),
    };
  }
}
