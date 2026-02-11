using FluentValidation;

namespace PRDF.Lms.Application.Documents.Validators;

public sealed class CreateDocumentRequirementRequestValidator : AbstractValidator<CreateDocumentRequirementRequest>
{
    public CreateDocumentRequirementRequestValidator()
    {
        RuleFor(x => x.RequiredAtStatus)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.DocType)
            .NotEmpty()
            .MaximumLength(100);
    }
}

public sealed class VerifyDocumentRequestValidator : AbstractValidator<VerifyDocumentRequest>
{
    public VerifyDocumentRequestValidator()
    {
        RuleFor(x => x.Status)
            .NotEmpty()
            .Must(s => string.Equals(s, "Verified", StringComparison.OrdinalIgnoreCase) || string.Equals(s, "Rejected", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Status must be Verified or Rejected.");

        RuleFor(x => x.Note)
            .MaximumLength(1000)
            .When(x => !string.IsNullOrWhiteSpace(x.Note));
    }
}
