import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface LoanProduct {
  id: string;
  name: string;
  description: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  minTermMonths: number | null;
  maxTermMonths: number | null;
  interestRate: number | null;
  isActive: boolean;
}

const SELECT_COLUMNS = `id, name, description, min_amount as "minAmount", max_amount as "maxAmount",
  min_term_months as "minTermMonths", max_term_months as "maxTermMonths",
  interest_rate as "interestRate", is_active as "isActive"`;

@Injectable()
export class LoanProductsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * The single currently-active product — mirrors the `is_active = true`
   * query both frontends already run directly against Supabase
   * (admin-ui/client-ui's loanProduct.ts). There's no product-selection UI
   * anywhere today, so "the active one" is the only concept that exists.
   */
  async getActiveProduct(): Promise<LoanProduct | null> {
    return this.db.queryOne<LoanProduct>(
      `select ${SELECT_COLUMNS} from public.loan_products where is_active = true order by created_at asc limit 1`,
    );
  }

  async getById(id: string): Promise<LoanProduct> {
    const row = await this.db.queryOne<LoanProduct>(
      `select ${SELECT_COLUMNS} from public.loan_products where id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Loan product not found.');
    return row;
  }
}
