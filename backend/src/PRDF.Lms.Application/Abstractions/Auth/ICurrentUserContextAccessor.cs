namespace PRDF.Lms.Application.Abstractions.Auth;

public interface ICurrentUserContextAccessor
{
    CurrentUserContext? GetCurrentUser();
}
