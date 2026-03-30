namespace PRDF.Lms.Application.AdminAccess;

public sealed record AdminAccessListItemDto(
    Guid UserId,
    string? FullName,
    string? Email,
    IReadOnlyCollection<string> Roles,
    bool IsAdmin,
    bool IsInternal,
    bool CanGrantAdmin,
    bool CanRevokeAdmin,
    string? GrantDisabledReason,
    string? RevokeDisabledReason
);

public sealed record AdminAccessMutationResultDto(
    Guid UserId,
    IReadOnlyCollection<string> Roles,
    bool IsAdmin
);

public sealed record AdminAccessQuery(
    string? Search,
    string Filter,
    string? Role
);
