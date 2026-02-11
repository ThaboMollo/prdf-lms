using System.Data;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Options;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Applications;
using PRDF.Lms.Domain.Enums;
using PRDF.Lms.Infrastructure.Configuration;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Applications;

public sealed class LoanApplicationService(
    IConnectionFactory connectionFactory,
    IOptions<SupabaseOptions> supabaseOptions,
    IHttpClientFactory httpClientFactory) : ILoanApplicationService
{
    private const string LoanDocumentsBucket = "loan-documents";
    private static readonly string[] StaffRoles = ["Admin", "LoanOfficer"];
    private static readonly string[] AssignedRoles = ["Intern", "Originator"];

    private readonly string _supabaseUrl = supabaseOptions.Value.Url;
    private readonly string _supabaseServiceRoleKey = supabaseOptions.Value.ServiceRoleKey;

    public async Task<ApplicationDetailsDto> CreateDraftAsync(CurrentUserContext actor, CreateLoanApplicationRequest request, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Purpose);

        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var assignedTo = request.AssignedToUserId;
        var clientId = request.ClientId;

        if (HasAnyRole(roles, AssignedRoles))
        {
            if (assignedTo is null || assignedTo != actor.UserId)
            {
                throw new UnauthorizedAccessException("Intern/Originator can only create applications assigned to themselves.");
            }
            if (clientId is null)
            {
                throw new InvalidOperationException("ClientId is required for intern/originator-created applications.");
            }
        }
        else if (HasRole(roles, "Client"))
        {
            clientId = await ResolveClientForSelfServiceAsync(connection, actor.UserId, request, cancellationToken);
            if (clientId is null)
            {
                throw new InvalidOperationException("Could not resolve client profile. Provide business info.");
            }
        }
        else if (HasAnyRole(roles, StaffRoles))
        {
            if (clientId is null)
            {
                throw new InvalidOperationException("ClientId is required for staff-created applications.");
            }
        }
        else
        {
            throw new UnauthorizedAccessException("Role not allowed to create applications.");
        }

        const string insertSql = """
            insert into public.loan_applications (
                id, client_id, requested_amount, term_months, purpose, status, assigned_to_user_id, created_at
            )
            values (
                @Id, @ClientId, @RequestedAmount, @TermMonths, @Purpose, @Status, @AssignedToUserId, now()
            );
            """;

        var appId = Guid.NewGuid();
        await connection.ExecuteAsync(new CommandDefinition(
            insertSql,
            new
            {
                Id = appId,
                ClientId = clientId,
                request.RequestedAmount,
                request.TermMonths,
                request.Purpose,
                Status = LoanApplicationStatus.Draft.ToString(),
                AssignedToUserId = assignedTo
            },
            cancellationToken: cancellationToken));

        await InsertStatusHistoryAsync(connection, appId, null, LoanApplicationStatus.Draft, actor.UserId, null, cancellationToken);
        await InsertAuditLogAsync(connection, "loan_applications", appId, "CreateDraftApplication", actor.UserId, new { ClientId = clientId, request.RequestedAmount }, cancellationToken);

        var created = await GetByIdInternalAsync(connection, appId, cancellationToken);
        return created ?? throw new InvalidOperationException("Failed to load created application.");
    }

    public async Task<ApplicationDetailsDto?> UpdateDraftAsync(CurrentUserContext actor, Guid applicationId, UpdateLoanApplicationRequest request, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Purpose);

        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var app = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (app is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, app);

        if (!string.Equals(app.Status, LoanApplicationStatus.Draft.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            if (!HasAnyRole(roles, StaffRoles))
            {
                throw new InvalidOperationException("Only staff can reassign non-draft applications.");
            }

            const string assignSql = """
                update public.loan_applications
                set assigned_to_user_id = @AssignedToUserId
                where id = @Id;
                """;

            await connection.ExecuteAsync(new CommandDefinition(
                assignSql,
                new
                {
                    Id = applicationId,
                    request.AssignedToUserId
                },
                cancellationToken: cancellationToken));

            await InsertAuditLogAsync(connection, "loan_applications", applicationId, "ReassignApplication", actor.UserId, new { request.AssignedToUserId }, cancellationToken);
            return await GetByIdInternalAsync(connection, applicationId, cancellationToken);
        }

        const string updateSql = """
            update public.loan_applications
            set requested_amount = @RequestedAmount,
                term_months = @TermMonths,
                purpose = @Purpose,
                assigned_to_user_id = @AssignedToUserId
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            updateSql,
            new
            {
                Id = applicationId,
                request.RequestedAmount,
                request.TermMonths,
                request.Purpose,
                request.AssignedToUserId
            },
            cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "loan_applications", applicationId, "UpdateDraftApplication", actor.UserId, new { request.RequestedAmount, request.TermMonths }, cancellationToken);

        return await GetByIdInternalAsync(connection, applicationId, cancellationToken);
    }

    public async Task<ApplicationDetailsDto?> SubmitAsync(CurrentUserContext actor, Guid applicationId, string? note, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var app = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (app is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, app);

        if (!string.Equals(app.Status, LoanApplicationStatus.Draft.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Only Draft applications can be submitted.");
        }

        const string submitSql = """
            update public.loan_applications
            set status = @Status,
                submitted_at = now()
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            submitSql,
            new { Id = applicationId, Status = LoanApplicationStatus.Submitted.ToString() },
            cancellationToken: cancellationToken));

        await InsertStatusHistoryAsync(connection, applicationId, LoanApplicationStatus.Draft, LoanApplicationStatus.Submitted, actor.UserId, note, cancellationToken);
        await InsertAuditLogAsync(connection, "loan_applications", applicationId, "SubmitApplication", actor.UserId, new { note }, cancellationToken);
        await CreateStatusNotificationsAsync(connection, applicationId, LoanApplicationStatus.Submitted, actor.UserId, note, cancellationToken);

        return await GetByIdInternalAsync(connection, applicationId, cancellationToken);
    }

    public async Task<IReadOnlyCollection<ApplicationListItemDto>> ListAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);

        var sql = """
            select la.id as Id,
                   la.client_id as ClientId,
                   la.requested_amount as RequestedAmount,
                   la.term_months as TermMonths,
                   la.purpose as Purpose,
                   la.status as Status,
                   la.created_at as CreatedAt,
                   la.submitted_at as SubmittedAt,
                   la.assigned_to_user_id as AssignedToUserId
            from public.loan_applications la
            join public.clients c on c.id = la.client_id
            """;

        object parameters;

        if (HasAnyRole(roles, StaffRoles))
        {
            sql += " order by la.created_at desc";
            parameters = new { };
        }
        else if (HasAnyRole(roles, AssignedRoles))
        {
            sql += " where la.assigned_to_user_id = @UserId order by la.created_at desc";
            parameters = new { UserId = actor.UserId };
        }
        else if (HasRole(roles, "Client"))
        {
            sql += " where c.user_id = @UserId order by la.created_at desc";
            parameters = new { UserId = actor.UserId };
        }
        else
        {
            return [];
        }

        var rows = await connection.QueryAsync<ApplicationRow>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return rows.Select(MapListItem).ToArray();
    }

    public async Task<ApplicationDetailsDto?> GetByIdAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        return await GetByIdInternalAsync(connection, applicationId, cancellationToken);
    }

    public async Task<PresignUploadResponse?> PresignDocumentUploadAsync(CurrentUserContext actor, Guid applicationId, PresignDocumentUploadRequest request, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(request.DocType);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.FileName);

        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        var safeFileName = request.FileName.Replace(" ", "-");
        var storagePath = $"applications/{applicationId}/{Guid.NewGuid():N}-{safeFileName}";
        var uploadUrl = await CreateSignedUploadUrlAsync(LoanDocumentsBucket, storagePath, cancellationToken);

        return new PresignUploadResponse(
            Bucket: LoanDocumentsBucket,
            StoragePath: storagePath,
            UploadUrl: uploadUrl,
            ExpiresInSeconds: 7200);
    }

    public async Task<ApplicationDocumentDto?> ConfirmDocumentUploadAsync(CurrentUserContext actor, Guid applicationId, ConfirmDocumentUploadRequest request, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(request.DocType);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.StoragePath);

        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        var documentId = Guid.NewGuid();

        const string insertSql = """
            insert into public.loan_documents (
                id,
                application_id,
                doc_type,
                storage_path,
                status,
                uploaded_by,
                uploaded_at
            )
            values (
                @Id,
                @ApplicationId,
                @DocType,
                @StoragePath,
                @Status,
                @UploadedBy,
                now()
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertSql,
            new
            {
                Id = documentId,
                ApplicationId = applicationId,
                request.DocType,
                request.StoragePath,
                Status = string.IsNullOrWhiteSpace(request.Status) ? "Pending" : request.Status,
                UploadedBy = actor.UserId
            },
            cancellationToken: cancellationToken));

        await InsertAuditLogAsync(connection, "loan_documents", documentId, "ConfirmDocumentUpload", actor.UserId, new { request.DocType, request.StoragePath }, cancellationToken);

        return await GetDocumentByIdAsync(connection, documentId, cancellationToken);
    }

    public async Task<IReadOnlyCollection<ApplicationDocumentDto>> ListDocumentsAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return [];
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        const string sql = """
            select id,
                   application_id as ApplicationId,
                   doc_type as DocType,
                   storage_path as StoragePath,
                   status,
                   uploaded_by as UploadedBy,
                   uploaded_at as UploadedAt
            from public.loan_documents
            where application_id = @ApplicationId
            order by uploaded_at desc;
            """;

        var rows = await connection.QueryAsync<DocumentRow>(new CommandDefinition(sql, new { ApplicationId = applicationId }, cancellationToken: cancellationToken));
        return rows.Select(MapDocument).ToArray();
    }

    public async Task<ApplicationDetailsDto?> ChangeStatusAsync(CurrentUserContext actor, Guid applicationId, LoanApplicationStatus toStatus, string? note, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        var fromStatus = Enum.Parse<LoanApplicationStatus>(projection.Status, true);
        EnsureTransitionAllowed(roles, fromStatus, toStatus);

        const string statusSql = """
            update public.loan_applications
            set status = @Status,
                submitted_at = case when @Status = 'Submitted' and submitted_at is null then now() else submitted_at end
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            statusSql,
            new { Id = applicationId, Status = toStatus.ToString() },
            cancellationToken: cancellationToken));

        if (toStatus == LoanApplicationStatus.InfoRequested)
        {
            await CreateInfoRequestedFollowUpAsync(connection, applicationId, note, actor.UserId, cancellationToken);
        }

        await InsertStatusHistoryAsync(connection, applicationId, fromStatus, toStatus, actor.UserId, note, cancellationToken);
        await InsertAuditLogAsync(connection, "loan_applications", applicationId, "ChangeApplicationStatus", actor.UserId, new { fromStatus, toStatus, note }, cancellationToken);
        await CreateStatusNotificationsAsync(connection, applicationId, toStatus, actor.UserId, note, cancellationToken);
        if (toStatus == LoanApplicationStatus.Approved)
        {
            await EnsureLoanCreatedForApprovedApplicationAsync(connection, applicationId, cancellationToken);
        }

        return await GetByIdInternalAsync(connection, applicationId, cancellationToken);
    }

    public async Task<IReadOnlyCollection<ApplicationStatusHistoryItemDto>> GetHistoryAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetSecurityProjectionAsync(connection, applicationId, cancellationToken);
        if (projection is null)
        {
            return [];
        }

        EnsureCanAccessApplication(roles, actor.UserId, projection);

        const string sql = """
            select id,
                   application_id as ApplicationId,
                   from_status as FromStatus,
                   to_status as ToStatus,
                   changed_by as ChangedBy,
                   changed_at as ChangedAt,
                   note
            from public.application_status_history
            where application_id = @ApplicationId
            order by changed_at asc;
            """;

        var rows = await connection.QueryAsync<ApplicationStatusHistoryRow>(new CommandDefinition(sql, new { ApplicationId = applicationId }, cancellationToken: cancellationToken));

        return rows.Select(x => new ApplicationStatusHistoryItemDto(
            x.Id,
            x.ApplicationId,
            string.IsNullOrWhiteSpace(x.FromStatus) ? null : Enum.Parse<LoanApplicationStatus>(x.FromStatus, true),
            Enum.Parse<LoanApplicationStatus>(x.ToStatus, true),
            x.ChangedBy,
            new DateTimeOffset(DateTime.SpecifyKind(x.ChangedAt, DateTimeKind.Utc)),
            x.Note)).ToArray();
    }

    private static async Task<bool> OwnsClientAsync(IDbConnection connection, Guid userId, Guid clientId, CancellationToken cancellationToken)
    {
        const string sql = "select exists (select 1 from public.clients where id = @ClientId and user_id = @UserId);";
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(sql, new { ClientId = clientId, UserId = userId }, cancellationToken: cancellationToken));
    }

    private static async Task<Guid?> ResolveClientForSelfServiceAsync(
        IDbConnection connection,
        Guid userId,
        CreateLoanApplicationRequest request,
        CancellationToken cancellationToken)
    {
        if (request.ClientId is Guid requestedClientId)
        {
            var ownsRequested = await OwnsClientAsync(connection, userId, requestedClientId, cancellationToken);
            if (ownsRequested)
            {
                return requestedClientId;
            }
        }

        const string existingClientSql = """
            select id
            from public.clients
            where user_id = @UserId
            order by created_at asc
            limit 1;
            """;

        var existingClientId = await connection.QuerySingleOrDefaultAsync<Guid?>(
            new CommandDefinition(existingClientSql, new { UserId = userId }, cancellationToken: cancellationToken));
        if (existingClientId is not null)
        {
            return existingClientId;
        }

        if (string.IsNullOrWhiteSpace(request.BusinessName))
        {
            return null;
        }

        var newClientId = Guid.NewGuid();
        const string insertClientSql = """
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
            insertClientSql,
            new
            {
                Id = newClientId,
                UserId = userId,
                request.BusinessName,
                request.RegistrationNo,
                request.Address
            },
            cancellationToken: cancellationToken));

        return newClientId;
    }

    private async Task<string[]> GetEffectiveRolesAsync(IDbConnection connection, Guid userId, CancellationToken cancellationToken)
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

    private static bool HasRole(IEnumerable<string> roles, string role)
    {
        return roles.Any(r => string.Equals(r, role, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasAnyRole(IEnumerable<string> roles, params string[] expected)
    {
        return expected.Any(role => HasRole(roles, role));
    }

    private static void EnsureCanAccessApplication(IEnumerable<string> roles, Guid userId, ApplicationSecurityProjection projection)
    {
        if (HasAnyRole(roles, StaffRoles))
        {
            return;
        }

        if (HasAnyRole(roles, AssignedRoles) && projection.AssignedToUserId == userId)
        {
            return;
        }

        if (HasRole(roles, "Client") && projection.ClientOwnerUserId == userId)
        {
            return;
        }

        throw new UnauthorizedAccessException("User cannot access this application.");
    }

    private static void EnsureTransitionAllowed(IEnumerable<string> roles, LoanApplicationStatus fromStatus, LoanApplicationStatus toStatus)
    {
        if (fromStatus == toStatus)
        {
            return;
        }

        var validTransition = (fromStatus, toStatus) switch
        {
            (LoanApplicationStatus.Draft, LoanApplicationStatus.Submitted) => true,
            (LoanApplicationStatus.Submitted, LoanApplicationStatus.UnderReview) => true,
            (LoanApplicationStatus.Submitted, LoanApplicationStatus.InfoRequested) => true,
            (LoanApplicationStatus.Submitted, LoanApplicationStatus.Approved) => true,
            (LoanApplicationStatus.Submitted, LoanApplicationStatus.Rejected) => true,
            (LoanApplicationStatus.UnderReview, LoanApplicationStatus.InfoRequested) => true,
            (LoanApplicationStatus.UnderReview, LoanApplicationStatus.Approved) => true,
            (LoanApplicationStatus.UnderReview, LoanApplicationStatus.Rejected) => true,
            (LoanApplicationStatus.InfoRequested, LoanApplicationStatus.Submitted) => true,
            (LoanApplicationStatus.InfoRequested, LoanApplicationStatus.UnderReview) => true,
            (LoanApplicationStatus.Approved, LoanApplicationStatus.Disbursed) => true,
            (LoanApplicationStatus.Disbursed, LoanApplicationStatus.InRepayment) => true,
            (LoanApplicationStatus.InRepayment, LoanApplicationStatus.Closed) => true,
            _ => false
        };

        if (!validTransition)
        {
            throw new InvalidOperationException($"Invalid status transition: {fromStatus} -> {toStatus}.");
        }

        if (toStatus == LoanApplicationStatus.Submitted)
        {
            return;
        }

        if (!HasAnyRole(roles, StaffRoles))
        {
            throw new UnauthorizedAccessException("Only LoanOfficer/Admin can perform this status transition.");
        }
    }

    private async Task<ApplicationSecurityProjection?> GetSecurityProjectionAsync(IDbConnection connection, Guid applicationId, CancellationToken cancellationToken)
    {
        const string sql = """
            select la.id as Id,
                   la.status as Status,
                   la.assigned_to_user_id as AssignedToUserId,
                   c.user_id as ClientOwnerUserId
            from public.loan_applications la
            join public.clients c on c.id = la.client_id
            where la.id = @Id;
            """;

        return await connection.QuerySingleOrDefaultAsync<ApplicationSecurityProjection>(new CommandDefinition(sql, new { Id = applicationId }, cancellationToken: cancellationToken));
    }

    private async Task<ApplicationDetailsDto?> GetByIdInternalAsync(IDbConnection connection, Guid applicationId, CancellationToken cancellationToken)
    {
        const string sql = """
            select la.id as Id,
                   la.client_id as ClientId,
                   la.requested_amount as RequestedAmount,
                   la.term_months as TermMonths,
                   la.purpose as Purpose,
                   la.status as Status,
                   la.created_at as CreatedAt,
                   la.submitted_at as SubmittedAt,
                   la.assigned_to_user_id as AssignedToUserId
            from public.loan_applications la
            where la.id = @Id;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<ApplicationRow>(new CommandDefinition(sql, new { Id = applicationId }, cancellationToken: cancellationToken));
        return row is null ? null : MapDetails(row);
    }

    private static async Task EnsureLoanCreatedForApprovedApplicationAsync(IDbConnection connection, Guid applicationId, CancellationToken cancellationToken)
    {
        const string existingSql = "select exists (select 1 from public.loans where application_id = @ApplicationId);";
        var exists = await connection.ExecuteScalarAsync<bool>(new CommandDefinition(
            existingSql,
            new { ApplicationId = applicationId },
            cancellationToken: cancellationToken));
        if (exists)
        {
            return;
        }

        const string sourceSql = """
            select requested_amount as RequestedAmount,
                   term_months as TermMonths
            from public.loan_applications
            where id = @ApplicationId;
            """;

        var source = await connection.QuerySingleOrDefaultAsync<LoanSeedRow>(new CommandDefinition(
            sourceSql,
            new { ApplicationId = applicationId },
            cancellationToken: cancellationToken));
        if (source is null)
        {
            return;
        }

        const string insertSql = """
            insert into public.loans (
                id,
                application_id,
                principal_amount,
                interest_rate,
                term_months,
                status,
                outstanding_principal,
                created_at
            )
            values (
                @Id,
                @ApplicationId,
                @PrincipalAmount,
                0,
                @TermMonths,
                'PendingDisbursement',
                @OutstandingPrincipal,
                now()
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertSql,
            new
            {
                Id = Guid.NewGuid(),
                ApplicationId = applicationId,
                PrincipalAmount = source.RequestedAmount,
                TermMonths = source.TermMonths,
                OutstandingPrincipal = source.RequestedAmount
            },
            cancellationToken: cancellationToken));
    }

    private static async Task CreateInfoRequestedFollowUpAsync(
        IDbConnection connection,
        Guid applicationId,
        string? note,
        Guid actorUserId,
        CancellationToken cancellationToken)
    {
        const string projectionSql = """
            select c.user_id as ClientUserId
            from public.loan_applications la
            join public.clients c on c.id = la.client_id
            where la.id = @ApplicationId;
            """;

        var projection = await connection.QuerySingleOrDefaultAsync<InfoRequestProjection>(new CommandDefinition(
            projectionSql,
            new { ApplicationId = applicationId },
            cancellationToken: cancellationToken));

        const string taskTitlePrefix = "Info requested from applicant";
        var taskTitle = string.IsNullOrWhiteSpace(note) ? taskTitlePrefix : $"{taskTitlePrefix}: {note}";

        const string insertTaskSql = """
            insert into public.tasks (
                id,
                application_id,
                title,
                status,
                assigned_to,
                due_date
            )
            values (
                @Id,
                @ApplicationId,
                @Title,
                'Open',
                @AssignedTo,
                current_date + 7
            );
            """;

        var taskId = Guid.NewGuid();
        await connection.ExecuteAsync(new CommandDefinition(
            insertTaskSql,
            new
            {
                Id = taskId,
                ApplicationId = applicationId,
                Title = taskTitle,
                AssignedTo = projection?.ClientUserId
            },
            cancellationToken: cancellationToken));

        const string noteBody = "Additional information has been requested. Please review tasks and provide requested documents/details.";
        var infoNote = string.IsNullOrWhiteSpace(note) ? noteBody : $"{noteBody} Note: {note}";

        const string insertNoteSql = """
            insert into public.notes (
                id,
                application_id,
                body,
                created_by,
                created_at
            )
            values (
                @Id,
                @ApplicationId,
                @Body,
                @CreatedBy,
                now()
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertNoteSql,
            new
            {
                Id = Guid.NewGuid(),
                ApplicationId = applicationId,
                Body = infoNote,
                CreatedBy = actorUserId
            },
            cancellationToken: cancellationToken));
    }

    private static async Task CreateStatusNotificationsAsync(
        IDbConnection connection,
        Guid applicationId,
        LoanApplicationStatus status,
        Guid actorUserId,
        string? note,
        CancellationToken cancellationToken)
    {
        const string sql = """
            select c.user_id as ClientUserId,
                   la.assigned_to_user_id as AssignedToUserId
            from public.loan_applications la
            join public.clients c on c.id = la.client_id
            where la.id = @ApplicationId;
            """;

        var projection = await connection.QuerySingleOrDefaultAsync<NotificationProjection>(new CommandDefinition(
            sql,
            new { ApplicationId = applicationId },
            cancellationToken: cancellationToken));
        if (projection is null)
        {
            return;
        }

        var targets = new[] { projection.ClientUserId, projection.AssignedToUserId }
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .Distinct()
            .Where(x => x != actorUserId)
            .ToArray();

        foreach (var target in targets)
        {
            await InsertNotificationAsync(
                connection,
                target,
                "ApplicationStatusChanged",
                "Application status updated",
                $"Application status changed to {status}.",
                new { applicationId, status = status.ToString(), note },
                cancellationToken);
        }
    }

    private static async Task<ApplicationDocumentDto?> GetDocumentByIdAsync(IDbConnection connection, Guid documentId, CancellationToken cancellationToken)
    {
        const string sql = """
            select id,
                   application_id as ApplicationId,
                   doc_type as DocType,
                   storage_path as StoragePath,
                   status,
                   uploaded_by as UploadedBy,
                   uploaded_at as UploadedAt
            from public.loan_documents
            where id = @Id;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<DocumentRow>(new CommandDefinition(sql, new { Id = documentId }, cancellationToken: cancellationToken));
        return row is null ? null : MapDocument(row);
    }

    private async Task<string> CreateSignedUploadUrlAsync(string bucket, string storagePath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_supabaseServiceRoleKey))
        {
            throw new InvalidOperationException("Supabase URL/service role key must be configured for presigned uploads.");
        }

        var normalizedPath = Uri.EscapeDataString(storagePath).Replace("%2F", "/", StringComparison.OrdinalIgnoreCase);
        var endpoint = $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/upload/sign/{bucket}/{normalizedPath}";

        using var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _supabaseServiceRoleKey);
        client.DefaultRequestHeaders.Add("apikey", _supabaseServiceRoleKey);

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"Could not generate signed upload URL ({(int)response.StatusCode}): {body}");
        }

        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);

        if (!doc.RootElement.TryGetProperty("token", out var tokenElement))
        {
            throw new InvalidOperationException("Supabase response did not include signed upload token.");
        }

        var token = tokenElement.GetString();
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("Supabase returned empty signed upload token.");
        }

        return $"{_supabaseUrl.TrimEnd('/')}/storage/v1/object/upload/sign/{bucket}/{normalizedPath}?token={Uri.EscapeDataString(token)}";
    }

    private static async Task InsertStatusHistoryAsync(
        IDbConnection connection,
        Guid applicationId,
        LoanApplicationStatus? fromStatus,
        LoanApplicationStatus toStatus,
        Guid changedBy,
        string? note,
        CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.application_status_history (
                id,
                application_id,
                from_status,
                to_status,
                changed_by,
                changed_at,
                note
            )
            values (
                @Id,
                @ApplicationId,
                @FromStatus,
                @ToStatus,
                @ChangedBy,
                now(),
                @Note
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            sql,
            new
            {
                Id = Guid.NewGuid(),
                ApplicationId = applicationId,
                FromStatus = fromStatus?.ToString(),
                ToStatus = toStatus.ToString(),
                ChangedBy = changedBy,
                Note = note
            },
            cancellationToken: cancellationToken));
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

    private static async Task InsertNotificationAsync(
        IDbConnection connection,
        Guid userId,
        string type,
        string title,
        string message,
        object payload,
        CancellationToken cancellationToken)
    {
        const string sql = """
            insert into public.notifications (
                id, user_id, channel, type, title, message, status, payload, created_at, sent_at
            )
            values (
                @Id, @UserId, 'InApp', @Type, @Title, @Message, 'Sent', cast(@PayloadJson as jsonb), now(), now()
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            sql,
            new
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Type = type,
                Title = title,
                Message = message,
                PayloadJson = JsonSerializer.Serialize(payload)
            },
            cancellationToken: cancellationToken));
    }

    private static ApplicationListItemDto MapListItem(ApplicationRow row)
    {
        return new ApplicationListItemDto(
            row.Id,
            row.ClientId,
            row.RequestedAmount,
            row.TermMonths,
            row.Purpose,
            Enum.Parse<LoanApplicationStatus>(row.Status, true),
            new DateTimeOffset(DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)),
            row.SubmittedAt is null ? null : new DateTimeOffset(DateTime.SpecifyKind(row.SubmittedAt.Value, DateTimeKind.Utc)),
            row.AssignedToUserId);
    }

    private static ApplicationDetailsDto MapDetails(ApplicationRow row)
    {
        return new ApplicationDetailsDto(
            row.Id,
            row.ClientId,
            row.RequestedAmount,
            row.TermMonths,
            row.Purpose,
            Enum.Parse<LoanApplicationStatus>(row.Status, true),
            new DateTimeOffset(DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)),
            row.SubmittedAt is null ? null : new DateTimeOffset(DateTime.SpecifyKind(row.SubmittedAt.Value, DateTimeKind.Utc)),
            row.AssignedToUserId);
    }

    private static ApplicationDocumentDto MapDocument(DocumentRow row)
    {
        return new ApplicationDocumentDto(
            row.Id,
            row.ApplicationId,
            row.DocType,
            row.StoragePath,
            row.Status,
            row.UploadedBy,
            new DateTimeOffset(DateTime.SpecifyKind(row.UploadedAt, DateTimeKind.Utc)));
    }

    private sealed record ApplicationRow(
        Guid Id,
        Guid ClientId,
        decimal RequestedAmount,
        int TermMonths,
        string Purpose,
        string Status,
        DateTime CreatedAt,
        DateTime? SubmittedAt,
        Guid? AssignedToUserId
    );

    private sealed record ApplicationSecurityProjection(
        Guid Id,
        string Status,
        Guid? AssignedToUserId,
        Guid? ClientOwnerUserId
    );

    private sealed record ApplicationStatusHistoryRow(
        Guid Id,
        Guid ApplicationId,
        string? FromStatus,
        string ToStatus,
        Guid ChangedBy,
        DateTime ChangedAt,
        string? Note
    );

    private sealed record LoanSeedRow(decimal RequestedAmount, int TermMonths);

    private sealed record InfoRequestProjection(Guid? ClientUserId);

    private sealed record NotificationProjection(Guid? ClientUserId, Guid? AssignedToUserId);

    private sealed record DocumentRow(
        Guid Id,
        Guid ApplicationId,
        string DocType,
        string StoragePath,
        string Status,
        Guid UploadedBy,
        DateTime UploadedAt
    );
}
