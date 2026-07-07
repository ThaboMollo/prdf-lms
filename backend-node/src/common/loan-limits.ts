// PRDF product loan limits. Keep in sync with client-ui/src/lib/loanLimits.ts
// and the loan_applications range constraints in infra/supabase/schema.sql.
export const LOAN_AMOUNT_MIN = 250_000;
export const LOAN_AMOUNT_MAX = 5_000_000;
export const LOAN_TERM_MIN = 1;
export const LOAN_TERM_MAX = 60;
