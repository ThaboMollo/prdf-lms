using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.Tasks;

public interface ITaskService
{
    Task<IReadOnlyCollection<TaskItemDto>> ListTasksAsync(CurrentUserContext actor, Guid? applicationId, bool assignedToMe, CancellationToken cancellationToken);

    Task<TaskItemDto> CreateTaskAsync(CurrentUserContext actor, CreateTaskRequest request, CancellationToken cancellationToken);

    Task<TaskItemDto?> UpdateTaskAsync(CurrentUserContext actor, Guid taskId, UpdateTaskRequest request, CancellationToken cancellationToken);

    Task<TaskItemDto?> CompleteTaskAsync(CurrentUserContext actor, Guid taskId, string? note, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<NoteItemDto>> ListNotesAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken);

    Task<NoteItemDto?> CreateNoteAsync(CurrentUserContext actor, Guid applicationId, string body, CancellationToken cancellationToken);
}
