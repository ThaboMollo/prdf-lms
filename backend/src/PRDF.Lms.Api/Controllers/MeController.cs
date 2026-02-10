using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Users;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Route("me")]
public sealed class MeController : ControllerBase
{
    [HttpGet]
    [Authorize]
    public ActionResult<MeResponse> Get()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        var fullName = User.FindFirstValue("full_name") ?? User.FindFirstValue("name");

        var roles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var roleClaim in User.FindAll(ClaimTypes.Role))
        {
            roles.Add(roleClaim.Value);
        }

        foreach (var roleClaim in User.FindAll("role"))
        {
            roles.Add(roleClaim.Value);
        }

        var appMetadataClaim = User.FindFirstValue("app_metadata");
        if (!string.IsNullOrWhiteSpace(appMetadataClaim))
        {
            try
            {
                using var doc = JsonDocument.Parse(appMetadataClaim);
                if (doc.RootElement.TryGetProperty("roles", out var rolesElement) && rolesElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in rolesElement.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.String)
                        {
                            var value = item.GetString();
                            if (!string.IsNullOrWhiteSpace(value))
                            {
                                roles.Add(value);
                            }
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // Ignore malformed metadata claims.
            }
        }

        return Ok(new MeResponse(
            UserId: userId,
            Email: email,
            FullName: fullName,
            Roles: roles.OrderBy(x => x).ToArray()
        ));
    }
}
