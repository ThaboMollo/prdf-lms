using System.Data;
using Dapper;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Reports;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Reports;

public sealed class ReportingService(IConnectionFactory connectionFactory) : IReportingService
{
    private static readonly string[] StaffRoles = ["Admin", "LoanOfficer"];

    public async Task<IReadOnlyCollection<AuditLogItemDto>> GetAuditLogAsync(CurrentUserContext actor, DateTimeOffset? from, DateTimeOffset? to, int limit, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        const string sql = """
            select id as Id,
                   entity as Entity,
                   entity_id as EntityId,
                   action as Action,
                   actor_user_id as ActorUserId,
                   at as At,
                   metadata::text as Metadata
            from public.audit_log
            where (@FromTs::timestamptz is null or at >= @FromTs::timestamptz)
              and (@ToTs::timestamptz is null or at <= @ToTs::timestamptz)
            order by at desc
            limit @Limit;
            """;

        var rows = await connection.QueryAsync<AuditRow>(new CommandDefinition(sql, new { FromTs = from?.UtcDateTime, ToTs = to?.UtcDateTime, Limit = limit }, cancellationToken: cancellationToken));
        return rows.Select(x => new AuditLogItemDto(
            x.Id,
            x.Entity,
            x.EntityId,
            x.Action,
            x.ActorUserId,
            new DateTimeOffset(DateTime.SpecifyKind(x.At, DateTimeKind.Utc)),
            x.Metadata)).ToArray();
    }

    public async Task<TurnaroundReportDto> GetTurnaroundReportAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        const string sql = """
            with submitted as (
                select application_id, min(changed_at) as submitted_at
                from public.application_status_history
                where to_status = 'Submitted'
                group by application_id
            ),
            approved as (
                select application_id, min(changed_at) as approved_at
                from public.application_status_history
                where to_status = 'Approved'
                group by application_id
            )
            select cast(count(*) as int) as Count,
                   cast(coalesce(avg(extract(epoch from (a.approved_at - s.submitted_at)) / 86400.0), 0) as double precision) as AverageDays
            from submitted s
            join approved a on a.application_id = s.application_id
            where a.approved_at >= s.submitted_at;
            """;

        var row = await connection.QuerySingleAsync<TurnaroundRow>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return new TurnaroundReportDto(row.Count, row.AverageDays);
    }

    public async Task<IReadOnlyCollection<PipelineConversionItemDto>> GetPipelineConversionReportAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        const string sql = """
            select from_status as FromStatus,
                   to_status as ToStatus,
                   cast(count(*) as int) as Count
            from public.application_status_history
            group by from_status, to_status
            order by count(*) desc;
            """;

        var rows = await connection.QueryAsync<PipelineRow>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return rows.Select(x => new PipelineConversionItemDto(x.FromStatus ?? "None", x.ToStatus, x.Count)).ToArray();
    }

    public async Task<IReadOnlyCollection<ProductivityItemDto>> GetProductivityReportAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        const string sql = """
            with task_stats as (
                select coalesce(assigned_to, changed_by) as user_id,
                       cast(count(*) filter (where status = 'Completed') as int) as tasks_completed
                from public.tasks t
                left join public.application_status_history h on h.application_id = t.application_id
                group by coalesce(assigned_to, changed_by)
            ),
            app_stats as (
                select assigned_to_user_id as user_id,
                       cast(count(*) as int) as applications_handled
                from public.loan_applications
                where assigned_to_user_id is not null
                group by assigned_to_user_id
            )
            select coalesce(t.user_id, a.user_id) as UserId,
                   coalesce(t.tasks_completed, 0) as TasksCompleted,
                   coalesce(a.applications_handled, 0) as ApplicationsHandled
            from task_stats t
            full join app_stats a on a.user_id = t.user_id
            where coalesce(t.user_id, a.user_id) is not null
            order by coalesce(t.tasks_completed, 0) desc, coalesce(a.applications_handled, 0) desc;
            """;

        var rows = await connection.QueryAsync<ProductivityItemDto>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return rows.ToArray();
    }

    private async Task EnsureStaffAsync(IDbConnection connection, Guid userId, CancellationToken cancellationToken)
    {
        const string sql = """
            select r.name
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.user_id = @UserId;
            """;

        var roles = (await connection.QueryAsync<string>(new CommandDefinition(sql, new { UserId = userId }, cancellationToken: cancellationToken))).ToArray();
        if (roles.Any(r => StaffRoles.Any(sr => string.Equals(sr, r, StringComparison.OrdinalIgnoreCase))))
        {
            return;
        }

        throw new UnauthorizedAccessException("Only Admin or LoanOfficer can access reports.");
    }

    private sealed record AuditRow(Guid Id, string Entity, string EntityId, string Action, Guid? ActorUserId, DateTime At, string Metadata);
    private sealed record PipelineRow(string? FromStatus, string ToStatus, int Count);
    private sealed record TurnaroundRow(int Count, double AverageDays);
}
