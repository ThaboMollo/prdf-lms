using FluentValidation;

namespace PRDF.Lms.Application.Clients.Validators;

public sealed class AssistedClientCreateRequestValidator : AbstractValidator<AssistedClientCreateRequest>
{
    public AssistedClientCreateRequestValidator()
    {
        RuleFor(x => x.BusinessName)
            .NotEmpty()
            .MaximumLength(200)
            .WithMessage("Business name is required.");

        RuleFor(x => x.RegistrationNo)
            .MaximumLength(100)
            .When(x => !string.IsNullOrWhiteSpace(x.RegistrationNo));

        RuleFor(x => x.Address)
            .MaximumLength(500)
            .When(x => !string.IsNullOrWhiteSpace(x.Address));

        RuleFor(x => x.ApplicantFullName)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.ApplicantFullName));

        RuleFor(x => x.ApplicantEmail)
            .EmailAddress()
            .When(x => !string.IsNullOrWhiteSpace(x.ApplicantEmail))
            .WithMessage("Applicant email must be valid.");

        RuleFor(x => x.ApplicantEmail)
            .NotEmpty()
            .When(x => x.SendInvite)
            .WithMessage("Applicant email is required when SendInvite is true.");
    }
}

public sealed class SendClientInviteRequestValidator : AbstractValidator<SendClientInviteRequest>
{
    public SendClientInviteRequestValidator()
    {
        RuleFor(x => x.ApplicantEmail)
            .NotEmpty()
            .EmailAddress()
            .WithMessage("Applicant email is required.");

        RuleFor(x => x.ApplicantFullName)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.ApplicantFullName));
    }
}
