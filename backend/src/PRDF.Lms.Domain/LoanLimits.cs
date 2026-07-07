namespace PRDF.Lms.Domain;

/// <summary>
/// PRDF product loan limits. Keep in sync with client-ui/src/lib/loanLimits.ts
/// and the loan_applications range constraints in infra/supabase/schema.sql.
/// </summary>
public static class LoanLimits
{
    public const decimal AmountMin = 250_000m;
    public const decimal AmountMax = 5_000_000m;
    public const int TermMonthsMin = 1;
    public const int TermMonthsMax = 60;
}
