namespace PRDF.Lms.Application.Tasks;

public sealed record TaskItemDto(
    Guid Id,
    Guid ApplicationId,
    string Title,
    string Status,
    Guid? AssignedTo,
    DateOnly? DueDate
);

public sealed record CreateTaskRequest(
    Guid ApplicationId,
    string Title,
    Guid? AssignedTo,
    DateOnly? DueDate
);

public sealed record UpdateTaskRequest(
    string? Title,
    Guid? AssignedTo,
    DateOnly? DueDate
);

public sealed record CompleteTaskRequest(string? Note);

public sealed record NoteItemDto(
    Guid Id,
    Guid ApplicationId,
    string Body,
    Guid CreatedBy,
    DateTimeOffset CreatedAt
);

public sealed record CreateNoteRequest(string Body);
