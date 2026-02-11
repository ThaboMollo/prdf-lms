namespace PRDF.Lms.Application.Notifications;

public sealed record NotificationDto(
    Guid Id,
    Guid UserId,
    string Channel,
    string Type,
    string Title,
    string Message,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? SentAt,
    DateTimeOffset? ReadAt,
    string? PayloadJson
);
