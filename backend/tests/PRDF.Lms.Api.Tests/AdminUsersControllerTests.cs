using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Api.Controllers;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.AdminAccess;

namespace PRDF.Lms.Api.Tests;

public sealed class AdminUsersControllerTests
{
    private static readonly CurrentUserContext AdminActor = new(Guid.NewGuid(), ["Admin"]);

    [Fact]
    public async Task ListAccess_ReturnsUnauthorized_WhenActorMissing()
    {
        var controller = CreateController(actor: null, service: new StubAdminAccessService());

        var result = await controller.ListAccess(null, "all", null, CancellationToken.None);

        Assert.IsType<UnauthorizedResult>(result.Result);
    }

    [Fact]
    public async Task ListAccess_ReturnsOk_WhenServiceSucceeds()
    {
        var service = new StubAdminAccessService
        {
            ListResult =
            [
                new AdminAccessListItemDto(Guid.NewGuid(), "Jane Doe", "jane@example.com", ["LoanOfficer"], false, true, true, false, null, "Not admin")
            ]
        };
        var controller = CreateController(AdminActor, service);

        var result = await controller.ListAccess("jane", "non-admins", "LoanOfficer", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IReadOnlyCollection<AdminAccessListItemDto>>(ok.Value);
        Assert.Single(payload);
    }

    [Fact]
    public async Task GrantAdmin_ReturnsConflict_WhenBusinessRuleFails()
    {
        var service = new StubAdminAccessService
        {
            GrantException = new InvalidOperationException("Cannot revoke Admin access from the last remaining admin.")
        };
        var controller = CreateController(AdminActor, service);

        var result = await controller.GrantAdmin(Guid.NewGuid(), CancellationToken.None);

        var conflict = Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.NotNull(conflict.Value);
    }

    [Fact]
    public async Task RevokeAdmin_ReturnsNotFound_WhenTargetMissing()
    {
        var service = new StubAdminAccessService
        {
            RevokeException = new ArgumentException("Target user was not found.", "userId")
        };
        var controller = CreateController(AdminActor, service);

        var result = await controller.RevokeAdmin(Guid.NewGuid(), CancellationToken.None);

        var notFound = Assert.IsType<NotFoundObjectResult>(result.Result);
        Assert.NotNull(notFound.Value);
    }

    [Fact]
    public async Task RevokeAdmin_ReturnsOk_WhenServiceSucceeds()
    {
        var targetUserId = Guid.NewGuid();
        var service = new StubAdminAccessService
        {
            RevokeResult = new AdminAccessMutationResultDto(targetUserId, ["LoanOfficer"], false)
        };
        var controller = CreateController(AdminActor, service);

        var result = await controller.RevokeAdmin(targetUserId, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsType<AdminAccessMutationResultDto>(ok.Value);
        Assert.Equal(targetUserId, payload.UserId);
        Assert.False(payload.IsAdmin);
    }

    private static AdminUsersController CreateController(CurrentUserContext? actor, IAdminAccessService service)
    {
        return new AdminUsersController(new StubCurrentUserContextAccessor(actor), service);
    }

    private sealed class StubCurrentUserContextAccessor(CurrentUserContext? actor) : ICurrentUserContextAccessor
    {
        public CurrentUserContext? GetCurrentUser() => actor;
    }

    private sealed class StubAdminAccessService : IAdminAccessService
    {
        public IReadOnlyCollection<AdminAccessListItemDto> ListResult { get; init; } = [];
        public AdminAccessMutationResultDto GrantResult { get; init; } = new(Guid.NewGuid(), ["Admin"], true);
        public AdminAccessMutationResultDto RevokeResult { get; init; } = new(Guid.NewGuid(), [], false);
        public Exception? GrantException { get; init; }
        public Exception? RevokeException { get; init; }
        public Exception? ListException { get; init; }

        public Task<IReadOnlyCollection<AdminAccessListItemDto>> ListUserAccessAsync(CurrentUserContext actor, AdminAccessQuery query, CancellationToken cancellationToken)
        {
            if (ListException is not null)
            {
                throw ListException;
            }

            return Task.FromResult(ListResult);
        }

        public Task<AdminAccessMutationResultDto> GrantAdminAsync(CurrentUserContext actor, Guid targetUserId, CancellationToken cancellationToken)
        {
            if (GrantException is not null)
            {
                throw GrantException;
            }

            return Task.FromResult(GrantResult);
        }

        public Task<AdminAccessMutationResultDto> RevokeAdminAsync(CurrentUserContext actor, Guid targetUserId, CancellationToken cancellationToken)
        {
            if (RevokeException is not null)
            {
                throw RevokeException;
            }

            return Task.FromResult(RevokeResult);
        }
    }
}
