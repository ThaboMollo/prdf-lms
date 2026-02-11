namespace PRDF.Lms.Application.Reports;

public sealed record AuditLogItemDto(
    Guid Id,
    string Entity,
    string EntityId,
    string Action,
    Guid? ActorUserId,
    DateTimeOffset At,
    string MetadataJson
);

public sealed record TurnaroundReportDto(
    int Count,
    double AverageDays
);

public sealed record PipelineConversionItemDto(
    string FromStatus,
    string ToStatus,
    int Count
);

public sealed record ProductivityItemDto(
    Guid UserId,
    int TasksCompleted,
    int ApplicationsHandled
);
