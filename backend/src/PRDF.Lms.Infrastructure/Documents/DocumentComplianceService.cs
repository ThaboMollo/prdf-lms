using System.Data;
using System.Text.Json;
using Dapper;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Documents;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Documents;

public sealed class DocumentComplianceService(IConnectionFactory connectionFactory) : IDocumentComplianceService
{
    private static readonly string[] StaffRoles = ["Admin", "LoanOfficer"];

    public async Task<IReadOnlyCollection<DocumentRequirementDto>> ListRequirementsAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        const string sql = """
            select id as Id,
                   loan_product_id as LoanProductId,
                   required_at_status as RequiredAtStatus,
                   doc_type as DocType,
                   is_required as IsRequired,
                   created_at as CreatedAt
            from public.document_requirements
            order by required_at_status asc, doc_type asc;
            """;

        var rows = await connection.QueryAsync<RequirementRow>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return rows.Select(Map).ToArray();
    }

    public async Task<DocumentRequirementDto> CreateRequirementAsync(CurrentUserContext actor, CreateDocumentRequirementRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        var id = Guid.NewGuid();
        const string sql = """
            insert into public.document_requirements (
                id, loan_product_id, required_at_status, doc_type, is_required, created_at
            )
            values (
                @Id, @LoanProductId, @RequiredAtStatus, @DocType, @IsRequired, now()
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            Id = id,
            request.LoanProductId,
            request.RequiredAtStatus,
            request.DocType,
            request.IsRequired
        }, cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "document_requirements", id, "CreateDocumentRequirement", actor.UserId, request, cancellationToken);

        var created = await GetRequirementByIdAsync(connection, id, cancellationToken);
        return created ?? throw new InvalidOperationException("Failed to load created requirement.");
    }

    public async Task VerifyDocumentAsync(CurrentUserContext actor, Guid applicationId, Guid documentId, string status, string? note, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await EnsureStaffAsync(connection, actor.UserId, cancellationToken);

        const string sql = """
            update public.loan_documents
            set status = @Status,
                verification_note = @Note,
                verified_by = @VerifiedBy,
                verified_at = now()
            where id = @DocumentId
              and application_id = @ApplicationId;
            """;

        var affected = await connection.ExecuteAsync(new CommandDefinition(sql, new
        {
            Status = status,
            Note = note,
            VerifiedBy = actor.UserId,
            DocumentId = documentId,
            ApplicationId = applicationId
        }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            throw new InvalidOperationException("Document not found for application.");
        }

        await InsertAuditLogAsync(connection, "loan_documents", documentId, "VerifyDocument", actor.UserId, new { status, note }, cancellationToken);
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

        throw new UnauthorizedAccessException("Only Admin or LoanOfficer can perform document compliance actions.");
    }

    private static DocumentRequirementDto Map(RequirementRow row)
    {
        return new DocumentRequirementDto(
            row.Id,
            row.LoanProductId,
            row.RequiredAtStatus,
            row.DocType,
            row.IsRequired,
            new DateTimeOffset(DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)));
    }

    private static async Task<DocumentRequirementDto?> GetRequirementByIdAsync(IDbConnection connection, Guid id, CancellationToken cancellationToken)
    {
        const string sql = """
            select id as Id,
                   loan_product_id as LoanProductId,
                   required_at_status as RequiredAtStatus,
                   doc_type as DocType,
                   is_required as IsRequired,
                   created_at as CreatedAt
            from public.document_requirements
            where id = @Id;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<RequirementRow>(new CommandDefinition(sql, new { Id = id }, cancellationToken: cancellationToken));
        return row is null ? null : Map(row);
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

    private sealed record RequirementRow(
        Guid Id,
        Guid? LoanProductId,
        string RequiredAtStatus,
        string DocType,
        bool IsRequired,
        DateTime CreatedAt
    );
}
