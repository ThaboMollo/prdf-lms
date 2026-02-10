using System.Data;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Options;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Clients;
using PRDF.Lms.Infrastructure.Configuration;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Clients;

public sealed class ClientOnboardingService(
    IConnectionFactory connectionFactory,
    IOptions<SupabaseOptions> supabaseOptions,
    IHttpClientFactory httpClientFactory) : IClientOnboardingService
{
    private static readonly string[] InternalRoles = ["Admin", "LoanOfficer", "Intern", "Originator"];
    private readonly string _supabaseUrl = supabaseOptions.Value.Url;
    private readonly string _serviceRoleKey = supabaseOptions.Value.ServiceRoleKey;

    public async Task<ClientSummaryDto> CreateAssistedClientAsync(CurrentUserContext actor, AssistedClientCreateRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        EnsureInternalUser(roles);

        var clientId = Guid.NewGuid();
        Guid? invitedUserId = null;

        if (request.SendInvite)
        {
            invitedUserId = await InviteAndPrepareUserAsync(
                connection,
                request.ApplicantEmail!,
                request.ApplicantFullName,
                request.RedirectTo,
                cancellationToken);
        }

        const string insertSql = """
            insert into public.clients (
                id,
                user_id,
                business_name,
                registration_no,
                address,
                created_at
            )
            values (
                @Id,
                @UserId,
                @BusinessName,
                @RegistrationNo,
                @Address,
                now()
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertSql,
            new
            {
                Id = clientId,
                UserId = invitedUserId,
                request.BusinessName,
                request.RegistrationNo,
                request.Address
            },
            cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "clients", clientId, "CreateAssistedClient", actor.UserId, new
        {
            request.BusinessName,
            request.ApplicantEmail,
            request.SendInvite
        }, cancellationToken);

        return await GetClientAsync(connection, clientId, cancellationToken)
            ?? throw new InvalidOperationException("Failed to load created client.");
    }

    public async Task<InviteClientResponse?> SendInviteAsync(CurrentUserContext actor, Guid clientId, SendClientInviteRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetRolesAsync(connection, actor.UserId, cancellationToken);
        EnsureInternalUser(roles);

        var client = await GetClientAsync(connection, clientId, cancellationToken);
        if (client is null)
        {
            return null;
        }

        var inviteResult = await InviteAndPrepareUserAsyncWithLink(
            connection,
            request.ApplicantEmail,
            request.ApplicantFullName,
            request.RedirectTo,
            cancellationToken);
        var invitedUserId = inviteResult.UserId;

        const string updateSql = """
            update public.clients
            set user_id = @UserId
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            updateSql,
            new { Id = clientId, UserId = invitedUserId },
            cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "clients", clientId, "SendClientInvite", actor.UserId, new
        {
            request.ApplicantEmail,
            request.RedirectTo
        }, cancellationToken);

        return new InviteClientResponse(invitedUserId, request.ApplicantEmail, "InviteLinkGenerated", inviteResult.ActionLink);
    }

    private async Task<Guid?> InviteAndPrepareUserAsync(
        IDbConnection connection,
        string email,
        string? fullName,
        string? redirectTo,
        CancellationToken cancellationToken)
    {
        var userId = (await InviteAndPrepareUserAsyncWithLink(connection, email, fullName, redirectTo, cancellationToken)).UserId;
        return userId;
    }

    private async Task<InviteGenerateResult> InviteAndPrepareUserAsyncWithLink(
        IDbConnection connection,
        string email,
        string? fullName,
        string? redirectTo,
        CancellationToken cancellationToken)
    {
        var invite = await InviteUserAsync(email, fullName, redirectTo, cancellationToken);
        var userId = invite.UserId;
        if (userId is null)
        {
            return invite;
        }

        const string profileSql = """
            insert into public.profiles (user_id, full_name, phone, created_at)
            values (@UserId, @FullName, null, now())
            on conflict (user_id)
            do update set full_name = excluded.full_name;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            profileSql,
            new
            {
                UserId = userId,
                FullName = string.IsNullOrWhiteSpace(fullName) ? email : fullName
            },
            cancellationToken: cancellationToken));

        const string roleSql = """
            insert into public.user_roles (user_id, role_id)
            select @UserId, r.id
            from public.roles r
            where r.name = 'Client'
            on conflict (user_id, role_id) do nothing;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            roleSql,
            new { UserId = userId },
            cancellationToken: cancellationToken));

        return invite;
    }

    private async Task<InviteGenerateResult> InviteUserAsync(string email, string? fullName, string? redirectTo, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceRoleKey))
        {
            throw new InvalidOperationException("Supabase URL/service role key must be configured for invite flow.");
        }

        using var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _serviceRoleKey);
        client.DefaultRequestHeaders.Add("apikey", _serviceRoleKey);

        var payload = new Dictionary<string, object?>
        {
            ["type"] = "invite",
            ["email"] = email,
            ["data"] = new Dictionary<string, object?> { ["full_name"] = fullName }
        };

        if (!string.IsNullOrWhiteSpace(redirectTo))
        {
            payload["redirect_to"] = redirectTo;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/generate_link")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"Could not generate invite link ({(int)response.StatusCode}): {body}");
        }

        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("user", out var userElement))
        {
            return new InviteGenerateResult(null, null);
        }

        Guid? userId = null;
        if (userElement.TryGetProperty("id", out var idElement))
        {
            var idText = idElement.GetString();
            if (Guid.TryParse(idText, out var parsed))
            {
                userId = parsed;
            }
        }

        string? actionLink = null;
        if (doc.RootElement.TryGetProperty("action_link", out var linkElement))
        {
            actionLink = linkElement.GetString();
        }

        return new InviteGenerateResult(userId, actionLink);
    }

    private static async Task<ClientSummaryDto?> GetClientAsync(IDbConnection connection, Guid clientId, CancellationToken cancellationToken)
    {
        const string sql = """
            select id as Id,
                   user_id as UserId,
                   business_name as BusinessName,
                   registration_no as RegistrationNo,
                   address as Address,
                   created_at as CreatedAt
            from public.clients
            where id = @Id;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<ClientRow>(new CommandDefinition(sql, new { Id = clientId }, cancellationToken: cancellationToken));
        if (row is null)
        {
            return null;
        }

        return new ClientSummaryDto(
            row.Id,
            row.UserId,
            row.BusinessName,
            row.RegistrationNo,
            row.Address,
            new DateTimeOffset(DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)));
    }

    private async Task<string[]> GetRolesAsync(IDbConnection connection, Guid userId, CancellationToken cancellationToken)
    {
        const string sql = """
            select r.name
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.user_id = @UserId;
            """;

        var roles = (await connection.QueryAsync<string>(new CommandDefinition(sql, new { UserId = userId }, cancellationToken: cancellationToken)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return roles;
    }

    private static void EnsureInternalUser(IEnumerable<string> roles)
    {
        if (roles.Any(r => InternalRoles.Any(i => string.Equals(i, r, StringComparison.OrdinalIgnoreCase))))
        {
            return;
        }

        throw new UnauthorizedAccessException("Only internal users can perform assisted onboarding.");
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

    private sealed record ClientRow(
        Guid Id,
        Guid? UserId,
        string BusinessName,
        string? RegistrationNo,
        string? Address,
        DateTime CreatedAt
    );

    private sealed record InviteGenerateResult(Guid? UserId, string? ActionLink);
}
