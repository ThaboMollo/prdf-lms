using FluentValidation;

namespace PRDF.Lms.Application.Loans.Validators;

public sealed class DisburseLoanRequestValidator : AbstractValidator<DisburseLoanRequest>
{
    public DisburseLoanRequestValidator()
    {
        RuleFor(x => x.Amount)
            .GreaterThan(0)
            .WithMessage("Disbursement amount must be greater than 0.");

        RuleFor(x => x.Reference)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.Reference));
    }
}

public sealed class RecordRepaymentRequestValidator : AbstractValidator<RecordRepaymentRequest>
{
    public RecordRepaymentRequestValidator()
    {
        RuleFor(x => x.Amount)
            .GreaterThan(0)
            .WithMessage("Repayment amount must be greater than 0.");

        RuleFor(x => x.PaymentReference)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.PaymentReference));
    }
}
