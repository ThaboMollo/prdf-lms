using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.Clients;

public interface IClientOnboardingService
{
    Task<ClientSummaryDto> CreateAssistedClientAsync(CurrentUserContext actor, AssistedClientCreateRequest request, CancellationToken cancellationToken);

    Task<InviteClientResponse?> SendInviteAsync(CurrentUserContext actor, Guid clientId, SendClientInviteRequest request, CancellationToken cancellationToken);
}
