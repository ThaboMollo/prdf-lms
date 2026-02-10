namespace PRDF.Lms.Application.Users;

public sealed record MeResponse(
    string UserId,
    string? Email,
    string? FullName,
    IReadOnlyCollection<string> Roles
);
