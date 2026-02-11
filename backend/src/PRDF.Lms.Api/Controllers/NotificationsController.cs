using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Notifications;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class NotificationsController(
    ICurrentUserContextAccessor currentUserContextAccessor,
    INotificationService notificationService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<NotificationDto>>> List([FromQuery] bool unreadOnly, CancellationToken cancellationToken)
    {
        var actor = currentUserContextAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var items = await notificationService.ListMyNotificationsAsync(actor, unreadOnly, cancellationToken);
        return Ok(items);
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var actor = currentUserContextAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        await notificationService.MarkAsReadAsync(actor, id, cancellationToken);
        return NoContent();
    }
}
