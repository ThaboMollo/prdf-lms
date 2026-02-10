namespace PRDF.Lms.Application.Abstractions.Auth;

public sealed record CurrentUserContext(Guid UserId, IReadOnlyCollection<string> Roles)
{
    public bool HasRole(string role)
    {
        return Roles.Any(r => string.Equals(r, role, StringComparison.OrdinalIgnoreCase));
    }

    public bool HasAnyRole(params string[] roles)
    {
        return roles.Any(HasRole);
    }
}
