using FluentValidation;
using PRDF.Lms.Domain.Enums;

namespace PRDF.Lms.Application.Applications.Validators;

public sealed class CreateLoanApplicationRequestValidator : AbstractValidator<CreateLoanApplicationRequest>
{
    public CreateLoanApplicationRequestValidator()
    {
        RuleFor(x => x.RequestedAmount)
            .GreaterThan(0)
            .WithMessage("Requested amount must be greater than 0.");

        RuleFor(x => x.TermMonths)
            .GreaterThan(0)
            .WithMessage("Term months must be greater than 0.");

        RuleFor(x => x.Purpose)
            .NotEmpty()
            .MaximumLength(500)
            .WithMessage("Purpose is required.");

        RuleFor(x => x.BusinessName)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.BusinessName));

        RuleFor(x => x.RegistrationNo)
            .MaximumLength(100)
            .When(x => !string.IsNullOrWhiteSpace(x.RegistrationNo));

        RuleFor(x => x.Address)
            .MaximumLength(500)
            .When(x => !string.IsNullOrWhiteSpace(x.Address));
    }
}

public sealed class UpdateLoanApplicationRequestValidator : AbstractValidator<UpdateLoanApplicationRequest>
{
    public UpdateLoanApplicationRequestValidator()
    {
        RuleFor(x => x.RequestedAmount)
            .GreaterThan(0)
            .WithMessage("Requested amount must be greater than 0.");

        RuleFor(x => x.TermMonths)
            .GreaterThan(0)
            .WithMessage("Term months must be greater than 0.");

        RuleFor(x => x.Purpose)
            .NotEmpty()
            .MaximumLength(500)
            .WithMessage("Purpose is required.");
    }
}

public sealed class SubmitLoanApplicationRequestValidator : AbstractValidator<SubmitLoanApplicationRequest>
{
    public SubmitLoanApplicationRequestValidator()
    {
        RuleFor(x => x.Note)
            .MaximumLength(1000)
            .When(x => !string.IsNullOrWhiteSpace(x.Note));
    }
}

public sealed class PresignDocumentUploadRequestValidator : AbstractValidator<PresignDocumentUploadRequest>
{
    public PresignDocumentUploadRequestValidator()
    {
        RuleFor(x => x.DocType)
            .NotEmpty()
            .MaximumLength(100)
            .WithMessage("Document type is required.");

        RuleFor(x => x.FileName)
            .NotEmpty()
            .MaximumLength(250)
            .WithMessage("File name is required.");

        RuleFor(x => x.ContentType)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.ContentType));
    }
}

public sealed class ConfirmDocumentUploadRequestValidator : AbstractValidator<ConfirmDocumentUploadRequest>
{
    public ConfirmDocumentUploadRequestValidator()
    {
        RuleFor(x => x.DocType)
            .NotEmpty()
            .MaximumLength(100)
            .WithMessage("Document type is required.");

        RuleFor(x => x.StoragePath)
            .NotEmpty()
            .MaximumLength(1000)
            .WithMessage("Storage path is required.");

        RuleFor(x => x.Status)
            .NotEmpty()
            .MaximumLength(100)
            .WithMessage("Status is required.");
    }
}

public sealed class ChangeApplicationStatusRequestValidator : AbstractValidator<ChangeApplicationStatusRequest>
{
    public ChangeApplicationStatusRequestValidator()
    {
        RuleFor(x => x.ToStatus)
            .IsInEnum()
            .Must(status => status != LoanApplicationStatus.Draft)
            .WithMessage("Transition to Draft is not allowed via this endpoint.");

        RuleFor(x => x.Note)
            .MaximumLength(1000)
            .When(x => !string.IsNullOrWhiteSpace(x.Note));
    }
}
