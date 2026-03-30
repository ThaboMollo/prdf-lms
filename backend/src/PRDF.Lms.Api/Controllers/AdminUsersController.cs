using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.AdminAccess;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/admin/users")]
public sealed class AdminUsersController(
    ICurrentUserContextAccessor currentUserAccessor,
    IAdminAccessService adminAccessService) : ControllerBase
{
    [HttpGet("access")]
    public async Task<ActionResult<IReadOnlyCollection<AdminAccessListItemDto>>> ListAccess(
        [FromQuery] string? search,
        [FromQuery] string filter = "all",
        [FromQuery] string? role = null,
        CancellationToken cancellationToken = default)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var items = await adminAccessService.ListUserAccessAsync(actor, new AdminAccessQuery(search, filter, role), cancellationToken);
            return Ok(items);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{userId:guid}/roles/admin")]
    public async Task<ActionResult<AdminAccessMutationResultDto>> GrantAdmin([FromRoute] Guid userId, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var result = await adminAccessService.GrantAdminAsync(actor, userId, cancellationToken);
            return Ok(result);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpDelete("{userId:guid}/roles/admin")]
    public async Task<ActionResult<AdminAccessMutationResultDto>> RevokeAdmin([FromRoute] Guid userId, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var result = await adminAccessService.RevokeAdminAsync(actor, userId, cancellationToken);
            return Ok(result);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }
}
