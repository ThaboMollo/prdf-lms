using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Infrastructure.Authentication;

public sealed class CurrentUserContextAccessor(IHttpContextAccessor httpContextAccessor) : ICurrentUserContextAccessor
{
    public CurrentUserContext? GetCurrentUser()
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        var roles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var roleClaim in user.FindAll(ClaimTypes.Role))
        {
            roles.Add(roleClaim.Value);
        }

        foreach (var roleClaim in user.FindAll("role"))
        {
            roles.Add(roleClaim.Value);
        }

        return new CurrentUserContext(userId, roles.ToArray());
    }
}
