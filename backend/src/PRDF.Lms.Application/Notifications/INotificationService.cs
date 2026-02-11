using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.Notifications;

public interface INotificationService
{
    Task<IReadOnlyCollection<NotificationDto>> ListMyNotificationsAsync(CurrentUserContext actor, bool unreadOnly, CancellationToken cancellationToken);

    Task MarkAsReadAsync(CurrentUserContext actor, Guid notificationId, CancellationToken cancellationToken);

    Task RunReminderScansAsync(CancellationToken cancellationToken);
}
