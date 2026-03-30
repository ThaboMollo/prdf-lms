using System.Data;
using System.Text.Json;
using Dapper;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.AdminAccess;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.AdminAccess;

public sealed class AdminAccessService(IConnectionFactory connectionFactory) : IAdminAccessService
{
    private const string AdminRoleName = "Admin";
    private static readonly HashSet<string> InternalRoles = new(StringComparer.OrdinalIgnoreCase) { "Admin", "LoanOfficer", "Originator", "Intern" };

    public async Task<IReadOnlyCollection<AdminAccessListItemDto>> ListUserAccessAsync(CurrentUserContext actor, AdminAccessQuery query, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureActorIsAdminAsync(connection, actor.UserId, cancellationToken);

        var normalizedFilter = NormalizeFilter(query.Filter);
        var roleFilter = string.IsNullOrWhiteSpace(query.Role) ? null : query.Role.Trim();
        var search = string.IsNullOrWhiteSpace(query.Search) ? null : query.Search.Trim();

        const string sql = """
            select u.id as UserId,
                   p.full_name as FullName,
                   u.email as Email,
                   coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as Roles
            from auth.users u
            left join public.profiles p on p.user_id = u.id
            left join public.user_roles ur on ur.user_id = u.id
            left join public.roles r on r.id = ur.role_id
            group by u.id, p.full_name, u.email
            having bool_or(r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern'))
               and (
                    @Search is null
                    or coalesce(p.full_name, '') ilike '%' || @Search || '%'
                    or coalesce(u.email, '') ilike '%' || @Search || '%'
               )
               and (
                    @RoleFilter is null
                    or bool_or(r.name = @RoleFilter)
               )
            order by coalesce(p.full_name, u.email, u.id::text);
            """;

        var rows = (await connection.QueryAsync<AccessRow>(
            new CommandDefinition(sql, new { Search = search, RoleFilter = roleFilter }, cancellationToken: cancellationToken)))
            .ToArray();

        var adminCount = rows.Count(IsAdmin);
        var result = rows
            .Where(row => FilterMatches(row, normalizedFilter))
            .Select(row => MapListItem(actor.UserId, row, adminCount))
            .ToArray();

        return result;
    }

    public async Task<AdminAccessMutationResultDto> GrantAdminAsync(CurrentUserContext actor, Guid targetUserId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureActorIsAdminAsync(connection, actor.UserId, cancellationToken);

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var target = await GetTargetUserAsync(connection, transaction, targetUserId, cancellationToken)
            ?? throw new ArgumentException("Target user was not found.", nameof(targetUserId));

        var beforeRoles = target.Roles;
        if (!IsInternal(beforeRoles))
        {
            throw new InvalidOperationException("Only existing internal users can be granted Admin access.");
        }

        var adminRoleId = await GetRoleIdAsync(connection, transaction, AdminRoleName, cancellationToken)
            ?? throw new InvalidOperationException("Admin role does not exist.");

        const string insertSql = """
            insert into public.user_roles (user_id, role_id)
            values (@UserId, @RoleId)
            on conflict (user_id, role_id) do nothing;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertSql,
            new { UserId = targetUserId, RoleId = adminRoleId },
            transaction,
            cancellationToken: cancellationToken));

        var afterRoles = await GetUserRolesAsync(connection, transaction, targetUserId, cancellationToken);
        await InsertAuditLogAsync(
            connection,
            transaction,
            targetUserId,
            "AdminGranted",
            actor.UserId,
            target.Email,
            target.FullName,
            beforeRoles,
            afterRoles,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return new AdminAccessMutationResultDto(targetUserId, afterRoles, IsAdmin(afterRoles));
    }

    public async Task<AdminAccessMutationResultDto> RevokeAdminAsync(CurrentUserContext actor, Guid targetUserId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureActorIsAdminAsync(connection, actor.UserId, cancellationToken);

        if (actor.UserId == targetUserId)
        {
            throw new InvalidOperationException("Admins cannot revoke their own Admin access from this screen.");
        }

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var target = await GetTargetUserAsync(connection, transaction, targetUserId, cancellationToken)
            ?? throw new ArgumentException("Target user was not found.", nameof(targetUserId));

        var beforeRoles = target.Roles;
        if (!IsAdmin(beforeRoles))
        {
            return new AdminAccessMutationResultDto(targetUserId, beforeRoles, false);
        }

        var adminCount = await CountAdminsAsync(connection, transaction, cancellationToken);
        if (adminCount <= 1)
        {
            throw new InvalidOperationException("Cannot revoke Admin access from the last remaining admin.");
        }

        var adminRoleId = await GetRoleIdAsync(connection, transaction, AdminRoleName, cancellationToken)
            ?? throw new InvalidOperationException("Admin role does not exist.");

        const string deleteSql = """
            delete from public.user_roles
            where user_id = @UserId
              and role_id = @RoleId;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            deleteSql,
            new { UserId = targetUserId, RoleId = adminRoleId },
            transaction,
            cancellationToken: cancellationToken));

        var afterRoles = await GetUserRolesAsync(connection, transaction, targetUserId, cancellationToken);
        await InsertAuditLogAsync(
            connection,
            transaction,
            targetUserId,
            "AdminRevoked",
            actor.UserId,
            target.Email,
            target.FullName,
            beforeRoles,
            afterRoles,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return new AdminAccessMutationResultDto(targetUserId, afterRoles, IsAdmin(afterRoles));
    }

    private static string NormalizeFilter(string? filter)
    {
        if (string.IsNullOrWhiteSpace(filter))
        {
            return "all";
        }

        return filter.Trim().ToLowerInvariant() switch
        {
            "all" => "all",
            "admins" => "admins",
            "non-admins" => "non-admins",
            _ => throw new ArgumentException("Unsupported filter value.", nameof(filter))
        };
    }

    private static bool FilterMatches(AccessRow row, string filter)
    {
        var isAdmin = IsAdmin(row);
        return filter switch
        {
            "admins" => isAdmin,
            "non-admins" => !isAdmin,
            _ => true
        };
    }

    private static AdminAccessListItemDto MapListItem(Guid actorUserId, AccessRow row, int adminCount)
    {
        var roles = NormalizeRoles(row.Roles);
        var isAdmin = IsAdmin(roles);
        var canGrant = !isAdmin;
        var canRevoke = isAdmin;
        string? grantDisabledReason = null;
        string? revokeDisabledReason = null;

        if (!IsInternal(roles))
        {
            canGrant = false;
            grantDisabledReason = "Only internal users are eligible.";
        }

        if (isAdmin && actorUserId == row.UserId)
        {
            canRevoke = false;
            revokeDisabledReason = "You cannot revoke your own Admin access.";
        }
        else if (isAdmin && adminCount <= 1)
        {
            canRevoke = false;
            revokeDisabledReason = "This is the last remaining admin.";
        }

        if (!isAdmin)
        {
            canRevoke = false;
            revokeDisabledReason = "User does not currently have Admin access.";
        }

        if (isAdmin)
        {
            canGrant = false;
            grantDisabledReason = "User already has Admin access.";
        }

        return new AdminAccessListItemDto(
            row.UserId,
            row.FullName,
            row.Email,
            roles,
            isAdmin,
            IsInternal(roles),
            canGrant,
            canRevoke,
            grantDisabledReason,
            revokeDisabledReason);
    }

    private static bool IsAdmin(AccessRow row)
        => IsAdmin(row.Roles);

    private static bool IsAdmin(IReadOnlyCollection<string> roles)
        => roles.Any(role => string.Equals(role, AdminRoleName, StringComparison.OrdinalIgnoreCase));

    private static bool IsInternal(IReadOnlyCollection<string> roles)
        => roles.Any(role => InternalRoles.Contains(role));

    private async Task EnsureActorIsAdminAsync(IDbConnection connection, Guid userId, CancellationToken cancellationToken)
    {
        var roles = await GetUserRolesAsync(connection, transaction: null, userId, cancellationToken);
        if (IsAdmin(roles))
        {
            return;
        }

        throw new UnauthorizedAccessException("Only Admin users can manage admin access.");
    }

    private static async Task<TargetUser?> GetTargetUserAsync(IDbConnection connection, IDbTransaction transaction, Guid userId, CancellationToken cancellationToken)
    {
        const string sql = """
            select u.id as UserId,
                   p.full_name as FullName,
                   u.email as Email,
                   coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as Roles
            from auth.users u
            left join public.profiles p on p.user_id = u.id
            left join public.user_roles ur on ur.user_id = u.id
            left join public.roles r on r.id = ur.role_id
            where u.id = @UserId
            group by u.id, p.full_name, u.email;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<AccessRow>(
            new CommandDefinition(sql, new { UserId = userId }, transaction, cancellationToken: cancellationToken));

        return row is null
            ? null
            : new TargetUser(row.UserId, row.FullName, row.Email, NormalizeRoles(row.Roles));
    }

    private static async Task<long?> GetRoleIdAsync(IDbConnection connection, IDbTransaction transaction, string roleName, CancellationToken cancellationToken)
    {
        const string sql = """
            select id
            from public.roles
            where name = @RoleName
            limit 1;
            """;

        return await connection.QuerySingleOrDefaultAsync<long?>(
            new CommandDefinition(sql, new { RoleName = roleName }, transaction, cancellationToken: cancellationToken));
    }

    private static async Task<IReadOnlyCollection<string>> GetUserRolesAsync(IDbConnection connection, IDbTransaction? transaction, Guid userId, CancellationToken cancellationToken)
    {
        const string sql = """
            select r.name
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.user_id = @UserId
            order by r.name;
            """;

        var roles = await connection.QueryAsync<string>(
            new CommandDefinition(sql, new { UserId = userId }, transaction, cancellationToken: cancellationToken));

        return NormalizeRoles(roles.ToArray());
    }

    private static async Task<int> CountAdminsAsync(IDbConnection connection, IDbTransaction transaction, CancellationToken cancellationToken)
    {
        const string sql = """
            select cast(count(distinct ur.user_id) as int)
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where r.name = @RoleName;
            """;

        return await connection.QuerySingleAsync<int>(
            new CommandDefinition(sql, new { RoleName = AdminRoleName }, transaction, cancellationToken: cancellationToken));
    }

    private static async Task InsertAuditLogAsync(
        IDbConnection connection,
        IDbTransaction transaction,
        Guid targetUserId,
        string action,
        Guid actorUserId,
        string? targetEmail,
        string? targetFullName,
        IReadOnlyCollection<string> priorRoles,
        IReadOnlyCollection<string> resultingRoles,
        CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.audit_log (
                entity,
                entity_id,
                action,
                actor_user_id,
                metadata
            ) values (
                @Entity,
                @EntityId,
                @Action,
                @ActorUserId,
                cast(@Metadata as jsonb)
            );
            """;

        var metadata = JsonSerializer.Serialize(new
        {
            targetEmail,
            targetFullName,
            priorRoles,
            resultingRoles,
            source = "admin-ui"
        });

        await connection.ExecuteAsync(new CommandDefinition(
            sql,
            new
            {
                Entity = "UserAccess",
                EntityId = targetUserId.ToString(),
                Action = action,
                ActorUserId = actorUserId,
                Metadata = metadata
            },
            transaction,
            cancellationToken: cancellationToken));
    }

    private static IReadOnlyCollection<string> NormalizeRoles(IEnumerable<string>? roles)
    {
        return (roles ?? [])
            .Where(role => !string.IsNullOrWhiteSpace(role))
            .Select(role => role.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(role => role, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private sealed record AccessRow(Guid UserId, string? FullName, string? Email, string[] Roles);
    private sealed record TargetUser(Guid UserId, string? FullName, string? Email, IReadOnlyCollection<string> Roles);
}
