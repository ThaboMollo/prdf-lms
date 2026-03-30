using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.AdminAccess;

public interface IAdminAccessService
{
    Task<IReadOnlyCollection<AdminAccessListItemDto>> ListUserAccessAsync(CurrentUserContext actor, AdminAccessQuery query, CancellationToken cancellationToken);

    Task<AdminAccessMutationResultDto> GrantAdminAsync(CurrentUserContext actor, Guid targetUserId, CancellationToken cancellationToken);

    Task<AdminAccessMutationResultDto> RevokeAdminAsync(CurrentUserContext actor, Guid targetUserId, CancellationToken cancellationToken);
}
