using System.Data;
using System.Text.Json;
using Dapper;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Notifications;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Notifications;

public sealed class NotificationService(IConnectionFactory connectionFactory) : INotificationService
{
    public async Task<IReadOnlyCollection<NotificationDto>> ListMyNotificationsAsync(CurrentUserContext actor, bool unreadOnly, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var sql = """
            select id as Id,
                   user_id as UserId,
                   channel as Channel,
                   type as Type,
                   title as Title,
                   message as Message,
                   status as Status,
                   created_at as CreatedAt,
                   sent_at as SentAt,
                   read_at as ReadAt,
                   payload::text as Payload
            from public.notifications
            where user_id = @UserId
            """;
        if (unreadOnly)
        {
            sql += " and read_at is null";
        }
        sql += " order by created_at desc limit 200;";

        var rows = await connection.QueryAsync<NotificationRow>(new CommandDefinition(sql, new { UserId = actor.UserId }, cancellationToken: cancellationToken));
        return rows.Select(Map).ToArray();
    }

    public async Task MarkAsReadAsync(CurrentUserContext actor, Guid notificationId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = """
            update public.notifications
            set read_at = coalesce(read_at, now()),
                status = case when status = 'Sent' then 'Read' else status end
            where id = @Id
              and user_id = @UserId;
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, new { Id = notificationId, UserId = actor.UserId }, cancellationToken: cancellationToken));
        await InsertAuditLogAsync(connection, "notifications", notificationId, "MarkNotificationRead", actor.UserId, new { notificationId }, cancellationToken);
    }

    public async Task RunReminderScansAsync(CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        await CreateArrearsNotificationsAsync(connection, cancellationToken);
        await CreatePendingTaskRemindersAsync(connection, cancellationToken);
        await CreateStaleApplicationFollowUpsAsync(connection, cancellationToken);
    }

    private static async Task CreateArrearsNotificationsAsync(IDbConnection connection, CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.notifications (
                id, user_id, channel, type, title, message, status, payload, created_at, sent_at
            )
            select
                gen_random_uuid(),
                c.user_id,
                'InApp',
                'ArrearsReminder',
                'Repayment overdue',
                'Your repayment is overdue. Please make payment as soon as possible.',
                'Sent',
                jsonb_build_object('loanId', l.id, 'applicationId', l.application_id),
                now(),
                now()
            from public.repayment_schedule rs
            join public.loans l on l.id = rs.loan_id
            join public.loan_applications la on la.id = l.application_id
            join public.clients c on c.id = la.client_id
            where rs.due_date < current_date
              and rs.due_total > rs.paid_amount
              and c.user_id is not null
              and not exists (
                select 1
                from public.notifications n
                where n.user_id = c.user_id
                  and n.type = 'ArrearsReminder'
                  and (n.payload->>'loanId')::uuid = l.id
                  and n.created_at::date = current_date
              );
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    private static async Task CreatePendingTaskRemindersAsync(IDbConnection connection, CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.notifications (
                id, user_id, channel, type, title, message, status, payload, created_at, sent_at
            )
            select
                gen_random_uuid(),
                t.assigned_to,
                'InApp',
                'TaskReminder',
                'Task reminder',
                'You have an open task due soon.',
                'Sent',
                jsonb_build_object('taskId', t.id, 'applicationId', t.application_id),
                now(),
                now()
            from public.tasks t
            where t.assigned_to is not null
              and t.status = 'Open'
              and t.due_date is not null
              and t.due_date <= current_date + 1
              and not exists (
                select 1
                from public.notifications n
                where n.user_id = t.assigned_to
                  and n.type = 'TaskReminder'
                  and (n.payload->>'taskId')::uuid = t.id
                  and n.created_at::date = current_date
              );
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    private static async Task CreateStaleApplicationFollowUpsAsync(IDbConnection connection, CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.notifications (
                id, user_id, channel, type, title, message, status, payload, created_at, sent_at
            )
            select
                gen_random_uuid(),
                coalesce(la.assigned_to_user_id, c.user_id),
                'InApp',
                'StaleApplicationFollowUp',
                'Application follow-up',
                'This application has been pending follow-up for over 7 days.',
                'Sent',
                jsonb_build_object('applicationId', la.id, 'status', la.status),
                now(),
                now()
            from public.loan_applications la
            join public.clients c on c.id = la.client_id
            where la.status in ('Submitted', 'UnderReview', 'InfoRequested')
              and la.created_at < now() - interval '7 days'
              and coalesce(la.assigned_to_user_id, c.user_id) is not null
              and not exists (
                select 1
                from public.notifications n
                where n.user_id = coalesce(la.assigned_to_user_id, c.user_id)
                  and n.type = 'StaleApplicationFollowUp'
                  and (n.payload->>'applicationId')::uuid = la.id
                  and n.created_at::date = current_date
              );
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    private static NotificationDto Map(NotificationRow row)
    {
        return new NotificationDto(
            row.Id,
            row.UserId,
            row.Channel,
            row.Type,
            row.Title,
            row.Message,
            row.Status,
            new DateTimeOffset(DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)),
            row.SentAt is null ? null : new DateTimeOffset(DateTime.SpecifyKind(row.SentAt.Value, DateTimeKind.Utc)),
            row.ReadAt is null ? null : new DateTimeOffset(DateTime.SpecifyKind(row.ReadAt.Value, DateTimeKind.Utc)),
            row.Payload);
    }

    private sealed record NotificationRow(
        Guid Id,
        Guid UserId,
        string Channel,
        string Type,
        string Title,
        string Message,
        string Status,
        DateTime CreatedAt,
        DateTime? SentAt,
        DateTime? ReadAt,
        string? Payload
    );

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
                id, entity, entity_id, action, actor_user_id, at, metadata
            )
            values (
                @Id, @Entity, @EntityId, @Action, @ActorUserId, now(), cast(@MetadataJson as jsonb)
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            Id = Guid.NewGuid(),
            Entity = entity,
            EntityId = entityId.ToString(),
            Action = action,
            ActorUserId = actorUserId,
            MetadataJson = JsonSerializer.Serialize(metadata)
        }, cancellationToken: cancellationToken));
    }
}
