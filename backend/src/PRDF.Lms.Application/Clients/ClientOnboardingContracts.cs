namespace PRDF.Lms.Application.Clients;

public sealed record AssistedClientCreateRequest(
    string BusinessName,
    string? RegistrationNo,
    string? Address,
    string? ApplicantFullName,
    string? ApplicantEmail,
    bool SendInvite,
    string? RedirectTo
);

public sealed record SendClientInviteRequest(
    string ApplicantEmail,
    string? ApplicantFullName,
    string? RedirectTo
);

public sealed record ClientSummaryDto(
    Guid Id,
    Guid? UserId,
    string BusinessName,
    string? RegistrationNo,
    string? Address,
    DateTimeOffset CreatedAt
);

public sealed record InviteClientResponse(
    Guid? UserId,
    string Email,
    string Status,
    string? ActionLink
);
