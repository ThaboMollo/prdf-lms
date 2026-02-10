using System.Data;
using System.Text.Json;
using Dapper;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Tasks;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Tasks;

public sealed class TaskService(IConnectionFactory connectionFactory) : ITaskService
{
    private static readonly string[] StaffRoles = ["Admin", "LoanOfficer"];
    private static readonly string[] InternalRoles = ["Admin", "LoanOfficer", "Intern", "Originator"];

    public async Task<IReadOnlyCollection<TaskItemDto>> ListTasksAsync(CurrentUserContext actor, Guid? applicationId, bool assignedToMe, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);

        var sql = """
            select t.id as Id,
                   t.application_id as ApplicationId,
                   t.title as Title,
                   t.status as Status,
                   t.assigned_to as AssignedTo,
                   t.due_date as DueDate
            from public.tasks t
            join public.loan_applications la on la.id = t.application_id
            join public.clients c on c.id = la.client_id
            where 1=1
            """;

        var p = new DynamicParameters();

        if (applicationId is Guid appId)
        {
            sql += " and t.application_id = @ApplicationId";
            p.Add("ApplicationId", appId);
        }

        if (assignedToMe)
        {
            sql += " and t.assigned_to = @UserId";
            p.Add("UserId", actor.UserId);
        }
        else if (!HasAnyRole(roles, StaffRoles))
        {
            sql += " and (t.assigned_to = @UserId or c.user_id = @UserId)";
            p.Add("UserId", actor.UserId);
        }

        sql += " order by t.due_date asc nulls last, t.title asc";

        var rows = await connection.QueryAsync<TaskRow>(new CommandDefinition(sql, p, cancellationToken: cancellationToken));
        return rows.Select(MapTask).ToArray();
    }

    public async Task<TaskItemDto> CreateTaskAsync(CurrentUserContext actor, CreateTaskRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        if (!HasAnyRole(roles, InternalRoles))
        {
            throw new UnauthorizedAccessException("Only internal users can create tasks.");
        }

        var projection = await GetApplicationSecurityProjectionAsync(connection, request.ApplicationId, cancellationToken);
        if (projection is null)
        {
            throw new InvalidOperationException("Application not found.");
        }
        EnsureCanAccessApplication(roles, actor.UserId, projection);

        var taskId = Guid.NewGuid();
        const string sql = """
            insert into public.tasks (id, application_id, title, status, assigned_to, due_date)
            values (@Id, @ApplicationId, @Title, 'Open', @AssignedTo, @DueDate);
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            Id = taskId,
            request.ApplicationId,
            request.Title,
            request.AssignedTo,
            DueDate = request.DueDate?.ToDateTime(TimeOnly.MinValue)
        }, cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "tasks", taskId, "CreateTask", actor.UserId, new
        {
            request.ApplicationId,
            request.Title,
            request.AssignedTo,
            request.DueDate
        }, cancellationToken);

        return await GetTaskByIdAsync(connection, taskId, cancellationToken)
            ?? throw new InvalidOperationException("Failed to load created task.");
    }

    public async Task<TaskItemDto?> UpdateTaskAsync(CurrentUserContext actor, Guid taskId, UpdateTaskRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var task = await GetTaskRecordAsync(connection, taskId, cancellationToken);
        if (task is null)
        {
            return null;
        }

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetApplicationSecurityProjectionAsync(connection, task.ApplicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessTaskMutation(roles, actor.UserId, task.AssignedTo, projection);

        const string sql = """
            update public.tasks
            set title = coalesce(@Title, title),
                assigned_to = @AssignedTo,
                due_date = @DueDate
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            Id = taskId,
            request.Title,
            request.AssignedTo,
            DueDate = request.DueDate?.ToDateTime(TimeOnly.MinValue)
        }, cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "tasks", taskId, "UpdateTask", actor.UserId, new
        {
            request.Title,
            request.AssignedTo,
            request.DueDate
        }, cancellationToken);

        return await GetTaskByIdAsync(connection, taskId, cancellationToken);
    }

    public async Task<TaskItemDto?> CompleteTaskAsync(CurrentUserContext actor, Guid taskId, string? note, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var task = await GetTaskRecordAsync(connection, taskId, cancellationToken);
        if (task is null)
        {
            return null;
        }

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetApplicationSecurityProjectionAsync(connection, task.ApplicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessTaskMutation(roles, actor.UserId, task.AssignedTo, projection);

        const string sql = "update public.tasks set status = 'Completed' where id = @Id;";
        await connection.ExecuteAsync(new CommandDefinition(sql, new { Id = taskId }, cancellationToken: cancellationToken));

        if (!string.IsNullOrWhiteSpace(note))
        {
            await CreateNoteAsync(actor, task.ApplicationId, note, cancellationToken);
        }

        await InsertAuditLogAsync(connection, "tasks", taskId, "CompleteTask", actor.UserId, new { note }, cancellationToken);
        return await GetTaskByIdAsync(connection, taskId, cancellationToken);
    }

    public async Task<IReadOnlyCollection<NoteItemDto>> ListNotesAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetApplicationSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return [];
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        const string sql = """
            select id as Id,
                   application_id as ApplicationId,
                   body as Body,
                   created_by as CreatedBy,
                   created_at as CreatedAt
            from public.notes
            where application_id = @ApplicationId
            order by created_at asc;
            """;

        var rows = await connection.QueryAsync<NoteRow>(new CommandDefinition(sql, new { ApplicationId = applicationId }, cancellationToken: cancellationToken));
        return rows.Select(MapNote).ToArray();
    }

    public async Task<NoteItemDto?> CreateNoteAsync(CurrentUserContext actor, Guid applicationId, string body, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetApplicationSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        var noteId = Guid.NewGuid();
        const string sql = """
            insert into public.notes (id, application_id, body, created_by, created_at)
            values (@Id, @ApplicationId, @Body, @CreatedBy, now());
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            Id = noteId,
            ApplicationId = applicationId,
            Body = body,
            CreatedBy = actor.UserId
        }, cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "notes", noteId, "CreateNote", actor.UserId, new { applicationId }, cancellationToken);

        return await GetNoteByIdAsync(connection, noteId, cancellationToken);
    }

    private static async Task<TaskItemDto?> GetTaskByIdAsync(IDbConnection connection, Guid taskId, CancellationToken cancellationToken)
    {
        const string sql = """
            select id as Id,
                   application_id as ApplicationId,
                   title as Title,
                   status as Status,
                   assigned_to as AssignedTo,
                   due_date as DueDate
            from public.tasks
            where id = @Id;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<TaskRow>(new CommandDefinition(sql, new { Id = taskId }, cancellationToken: cancellationToken));
        return row is null ? null : MapTask(row);
    }

    private static async Task<TaskRecordRow?> GetTaskRecordAsync(IDbConnection connection, Guid taskId, CancellationToken cancellationToken)
    {
        const string sql = """
            select id as Id,
                   application_id as ApplicationId,
                   assigned_to as AssignedTo
            from public.tasks
            where id = @Id;
            """;

        return await connection.QuerySingleOrDefaultAsync<TaskRecordRow>(new CommandDefinition(sql, new { Id = taskId }, cancellationToken: cancellationToken));
    }

    private static async Task<NoteItemDto?> GetNoteByIdAsync(IDbConnection connection, Guid noteId, CancellationToken cancellationToken)
    {
        const string sql = """
            select id as Id,
                   application_id as ApplicationId,
                   body as Body,
                   created_by as CreatedBy,
                   created_at as CreatedAt
            from public.notes
            where id = @Id;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<NoteRow>(new CommandDefinition(sql, new { Id = noteId }, cancellationToken: cancellationToken));
        return row is null ? null : MapNote(row);
    }

    private static TaskItemDto MapTask(TaskRow row)
    {
        return new TaskItemDto(
            row.Id,
            row.ApplicationId,
            row.Title,
            row.Status,
            row.AssignedTo,
            row.DueDate is null ? null : DateOnly.FromDateTime(row.DueDate.Value));
    }

    private static NoteItemDto MapNote(NoteRow row)
    {
        return new NoteItemDto(
            row.Id,
            row.ApplicationId,
            row.Body,
            row.CreatedBy,
            new DateTimeOffset(DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)));
    }

    private static void EnsureCanAccessTaskMutation(IEnumerable<string> roles, Guid userId, Guid? assignedTo, ApplicationSecurityProjection projection)
    {
        if (HasAnyRole(roles, StaffRoles))
        {
            return;
        }

        if (assignedTo == userId)
        {
            return;
        }

        EnsureCanAccessApplication(roles, userId, projection);
    }

    private static void EnsureCanAccessApplication(IEnumerable<string> roles, Guid userId, ApplicationSecurityProjection projection)
    {
        if (HasAnyRole(roles, StaffRoles))
        {
            return;
        }

        if ((HasRole(roles, "Intern") || HasRole(roles, "Originator")) && projection.AssignedToUserId == userId)
        {
            return;
        }

        if (HasRole(roles, "Client") && projection.ClientOwnerUserId == userId)
        {
            return;
        }

        throw new UnauthorizedAccessException("User cannot access this application.");
    }

    private static bool HasRole(IEnumerable<string> roles, string role)
    {
        return roles.Any(r => string.Equals(r, role, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasAnyRole(IEnumerable<string> roles, params string[] expected)
    {
        return expected.Any(role => HasRole(roles, role));
    }

    private async Task<string[]> GetRolesAsync(IDbConnection connection, Guid userId, CancellationToken cancellationToken)
    {
        const string sql = """
            select r.name
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.user_id = @UserId;
            """;

        return (await connection.QueryAsync<string>(new CommandDefinition(sql, new { UserId = userId }, cancellationToken: cancellationToken)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static async Task<ApplicationSecurityProjection?> GetApplicationSecurityProjectionAsync(IDbConnection connection, Guid applicationId, CancellationToken cancellationToken)
    {
        const string sql = """
            select la.id as Id,
                   la.assigned_to_user_id as AssignedToUserId,
                   c.user_id as ClientOwnerUserId
            from public.loan_applications la
            join public.clients c on c.id = la.client_id
            where la.id = @Id;
            """;

        return await connection.QuerySingleOrDefaultAsync<ApplicationSecurityProjection>(new CommandDefinition(sql, new { Id = applicationId }, cancellationToken: cancellationToken));
    }

    private static async Task InsertAuditLogAsync(
        IDbConnection connection,
        string entity,
        Guid entityId,
        string action,
        Guid actorUserId,
        object metadata,
        CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.audit_log (
                id,
                entity,
                entity_id,
                action,
                actor_user_id,
                at,
                metadata
            )
            values (
                @Id,
                @Entity,
                @EntityId,
                @Action,
                @ActorUserId,
                now(),
                cast(@MetadataJson as jsonb)
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            sql,
            new
            {
                Id = Guid.NewGuid(),
                Entity = entity,
                EntityId = entityId.ToString(),
                Action = action,
                ActorUserId = actorUserId,
                MetadataJson = JsonSerializer.Serialize(metadata)
            },
            cancellationToken: cancellationToken));
    }

    private sealed record TaskRow(
        Guid Id,
        Guid ApplicationId,
        string Title,
        string Status,
        Guid? AssignedTo,
        DateTime? DueDate
    );

    private sealed record TaskRecordRow(Guid Id, Guid ApplicationId, Guid? AssignedTo);

    private sealed record NoteRow(
        Guid Id,
        Guid ApplicationId,
        string Body,
        Guid CreatedBy,
        DateTime CreatedAt
    );

    private sealed record ApplicationSecurityProjection(
        Guid Id,
        Guid? AssignedToUserId,
        Guid? ClientOwnerUserId
    );
}
