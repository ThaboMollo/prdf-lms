using System.Data;
using System.Text.Json;
using Dapper;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Loans;
using PRDF.Lms.Domain.Enums;
using PRDF.Lms.Infrastructure.Data;

namespace PRDF.Lms.Infrastructure.Loans;

public sealed class LoanService(IConnectionFactory connectionFactory) : ILoanService
{
    private static readonly string[] StaffRoles = ["Admin", "LoanOfficer"];
    private static readonly string[] AssignedRoles = ["Intern", "Originator"];

    public async Task<LoanDetailsDto?> GetByIdAsync(CurrentUserContext actor, Guid loanId, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        var projection = await GetLoanSecurityProjectionAsync(connection, loanId, cancellationToken);
        if (projection is null)
        {
            return null;
        }

        EnsureCanAccessLoan(roles, actor.UserId, projection);
        return await GetDetailsInternalAsync(connection, loanId, cancellationToken);
    }

    public async Task<LoanDetailsDto?> DisburseAsync(CurrentUserContext actor, Guid loanId, DisburseLoanRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        EnsureStaffOnly(roles);

        var loan = await GetLoanForUpdateAsync(connection, loanId, transaction, cancellationToken);
        if (loan is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return null;
        }

        if (loan.Status is not LoanStatus.PendingDisbursement and not LoanStatus.Disbursed)
        {
            throw new InvalidOperationException($"Loan status {loan.Status} cannot be disbursed.");
        }

        var amount = request.Amount > loan.OutstandingPrincipal ? loan.OutstandingPrincipal : request.Amount;
        if (amount <= 0)
        {
            throw new InvalidOperationException("Disbursement amount must be greater than zero.");
        }

        const string insertDisbursementSql = """
            insert into public.disbursements (
                id,
                loan_id,
                amount,
                disbursed_at,
                disbursed_by,
                reference
            )
            values (
                @Id,
                @LoanId,
                @Amount,
                now(),
                @DisbursedBy,
                @Reference
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertDisbursementSql,
            new
            {
                Id = Guid.NewGuid(),
                LoanId = loanId,
                Amount = amount,
                DisbursedBy = actor.UserId,
                request.Reference
            },
            transaction,
            cancellationToken: cancellationToken));

        const string updateLoanSql = """
            update public.loans
            set status = @Status,
                disbursed_at = coalesce(disbursed_at, now())
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            updateLoanSql,
            new { Id = loanId, Status = LoanStatus.Disbursed.ToString() },
            transaction,
            cancellationToken: cancellationToken));

        await SyncApplicationStatusAsync(connection, loan.ApplicationId, LoanApplicationStatus.Disbursed, actor.UserId, "Loan disbursed.", transaction, cancellationToken);
        await EnsureRepaymentScheduleAsync(connection, loan, transaction, cancellationToken);
        await InsertAuditLogAsync(connection, "loans", loanId, "DisburseLoan", actor.UserId, new { amount, request.Reference }, transaction, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return await GetDetailsInternalAsync(connection, loanId, cancellationToken);
    }

    public async Task<LoanDetailsDto?> RecordRepaymentAsync(CurrentUserContext actor, Guid loanId, RecordRepaymentRequest request, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        EnsureStaffOnly(roles);

        var loan = await GetLoanForUpdateAsync(connection, loanId, transaction, cancellationToken);
        if (loan is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return null;
        }

        if (loan.Status == LoanStatus.Closed)
        {
            throw new InvalidOperationException("Closed loan cannot accept repayments.");
        }

        var principalComponent = Math.Min(request.Amount, loan.OutstandingPrincipal);
        var interestComponent = request.Amount - principalComponent;
        var newOutstanding = Math.Max(0, loan.OutstandingPrincipal - principalComponent);
        var nextStatus = newOutstanding == 0 ? LoanStatus.Closed : LoanStatus.InRepayment;

        const string insertRepaymentSql = """
            insert into public.repayments (
                id,
                loan_id,
                amount,
                principal_component,
                interest_component,
                paid_at,
                payment_reference,
                recorded_by
            )
            values (
                @Id,
                @LoanId,
                @Amount,
                @PrincipalComponent,
                @InterestComponent,
                @PaidAt,
                @PaymentReference,
                @RecordedBy
            );
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            insertRepaymentSql,
            new
            {
                Id = Guid.NewGuid(),
                LoanId = loanId,
                request.Amount,
                PrincipalComponent = principalComponent,
                InterestComponent = interestComponent,
                PaidAt = request.PaidAt?.UtcDateTime ?? DateTime.UtcNow,
                request.PaymentReference,
                RecordedBy = actor.UserId
            },
            transaction,
            cancellationToken: cancellationToken));

        const string updateLoanSql = """
            update public.loans
            set outstanding_principal = @OutstandingPrincipal,
                status = @Status
            where id = @Id;
            """;

        await connection.ExecuteAsync(new CommandDefinition(
            updateLoanSql,
            new
            {
                Id = loanId,
                OutstandingPrincipal = newOutstanding,
                Status = nextStatus.ToString()
            },
            transaction,
            cancellationToken: cancellationToken));

        await ApplyRepaymentToScheduleAsync(connection, loanId, request.Amount, request.PaidAt?.UtcDateTime ?? DateTime.UtcNow, transaction, cancellationToken);

        var appStatus = nextStatus == LoanStatus.Closed ? LoanApplicationStatus.Closed : LoanApplicationStatus.InRepayment;
        await SyncApplicationStatusAsync(connection, loan.ApplicationId, appStatus, actor.UserId, "Repayment recorded.", transaction, cancellationToken);
        await InsertAuditLogAsync(connection, "repayments", loanId, "RecordRepayment", actor.UserId, new { request.Amount, principalComponent, interestComponent }, transaction, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return await GetDetailsInternalAsync(connection, loanId, cancellationToken);
    }

    public async Task<PortfolioSummaryDto> GetPortfolioSummaryAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        EnsureStaffOnly(roles);

        const string sql = """
            select
                cast(count(*) as int) as TotalLoans,
                cast(count(*) filter (where status in ('Disbursed', 'InRepayment')) as int) as ActiveLoans,
                coalesce(sum(principal_amount), 0) as TotalPrincipal,
                coalesce(sum(outstanding_principal), 0) as OutstandingPrincipal
            from public.loans;
            """;

        var row = await connection.QuerySingleAsync<PortfolioRow>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        var repaid = row.TotalPrincipal - row.OutstandingPrincipal;
        return new PortfolioSummaryDto(row.TotalLoans, row.ActiveLoans, row.TotalPrincipal, row.OutstandingPrincipal, repaid);
    }

    public async Task<IReadOnlyCollection<ArrearsItemDto>> GetArrearsAsync(CurrentUserContext actor, CancellationToken cancellationToken)
    {
        await using var connection = connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var roles = await GetEffectiveRolesAsync(connection, actor.UserId, cancellationToken);
        EnsureStaffOnly(roles);

        const string sql = """
            select
                rs.loan_id as LoanId,
                l.application_id as ApplicationId,
                rs.installment_no as InstallmentNo,
                rs.due_date as DueDate,
                rs.due_total as DueTotal,
                rs.paid_amount as PaidAmount,
                cast(greatest(rs.due_total - rs.paid_amount, 0) as numeric(18,2)) as OutstandingAmount,
                cast(greatest((current_date - rs.due_date), 0) as int) as DaysOverdue
            from public.repayment_schedule rs
            join public.loans l on l.id = rs.loan_id
            where rs.due_date < current_date
              and rs.due_total > rs.paid_amount
              and l.status <> 'Closed'
            order by rs.due_date asc, rs.installment_no asc;
            """;

        var rows = await connection.QueryAsync<ArrearsRow>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return rows.Select(x => new ArrearsItemDto(
            x.LoanId,
            x.ApplicationId,
            x.InstallmentNo,
            DateOnly.FromDateTime(x.DueDate),
            x.DueTotal,
            x.PaidAmount,
            x.OutstandingAmount,
            x.DaysOverdue)).ToArray();
    }

    private static async Task ApplyRepaymentToScheduleAsync(
        IDbConnection connection,
        Guid loanId,
        decimal paymentAmount,
        DateTime paidAt,
        IDbTransaction transaction,
        CancellationToken cancellationToken)
    {
        var remaining = paymentAmount;
        while (remaining > 0)
        {
            const string nextInstallmentSql = """
                select id as Id,
                       due_total as DueTotal,
                       paid_amount as PaidAmount
                from public.repayment_schedule
                where loan_id = @LoanId
                  and paid_amount < due_total
                order by installment_no asc
                limit 1;
                """;

            var installment = await connection.QuerySingleOrDefaultAsync<RepaymentScheduleBalanceRow>(new CommandDefinition(
                nextInstallmentSql,
                new { LoanId = loanId },
                transaction,
                cancellationToken: cancellationToken));

            if (installment is null)
            {
                break;
            }

            var dueRemaining = installment.DueTotal - installment.PaidAmount;
            var applied = Math.Min(remaining, dueRemaining);
            remaining -= applied;

            const string updateInstallmentSql = """
                update public.repayment_schedule
                set paid_amount = paid_amount + @Applied,
                    status = case when paid_amount + @Applied >= due_total then 'Paid' else 'Pending' end,
                    paid_at = case when paid_amount + @Applied >= due_total then @PaidAt else paid_at end
                where id = @Id;
                """;

            await connection.ExecuteAsync(new CommandDefinition(
                updateInstallmentSql,
                new { installment.Id, Applied = applied, PaidAt = paidAt },
                transaction,
                cancellationToken: cancellationToken));
        }
    }

    private static async Task SyncApplicationStatusAsync(
        IDbConnection connection,
        Guid applicationId,
        LoanApplicationStatus desiredStatus,
        Guid actorUserId,
        string? note,
        IDbTransaction transaction,
        CancellationToken cancellationToken)
    {
        const string selectSql = "select status from public.loan_applications where id = @Id;";
        var currentStatusRaw = await connection.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            selectSql,
            new { Id = applicationId },
            transaction,
            cancellationToken: cancellationToken));

        if (string.IsNullOrWhiteSpace(currentStatusRaw))
        {
            return;
        }

        var currentStatus = Enum.Parse<LoanApplicationStatus>(currentStatusRaw, true);
        if (currentStatus == desiredStatus)
        {
            return;
        }

        const string updateSql = "update public.loan_applications set status = @Status where id = @Id;";
        await connection.ExecuteAsync(new CommandDefinition(
            updateSql,
            new { Id = applicationId, Status = desiredStatus.ToString() },
            transaction,
            cancellationToken: cancellationToken));

        const string historySql = """
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
            historySql,
            new
            {
                Id = Guid.NewGuid(),
                ApplicationId = applicationId,
                FromStatus = currentStatus.ToString(),
                ToStatus = desiredStatus.ToString(),
                ChangedBy = actorUserId,
                Note = note
            },
            transaction,
            cancellationToken: cancellationToken));
    }

    private static async Task InsertAuditLogAsync(
        IDbConnection connection,
        string entity,
        Guid entityId,
        string action,
        Guid actorUserId,
        object metadata,
        IDbTransaction transaction,
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
            transaction,
            cancellationToken: cancellationToken));
    }

    private async Task EnsureRepaymentScheduleAsync(IDbConnection connection, LoanForUpdateRow loan, IDbTransaction transaction, CancellationToken cancellationToken)
    {
        const string countSql = "select count(*) from public.repayment_schedule where loan_id = @LoanId;";
        var existing = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            countSql,
            new { LoanId = loan.Id },
            transaction,
            cancellationToken: cancellationToken));

        if (existing > 0)
        {
            return;
        }

        var baseDate = DateOnly.FromDateTime(DateTime.UtcNow);
        var installmentPrincipal = decimal.Round(loan.PrincipalAmount / loan.TermMonths, 2, MidpointRounding.AwayFromZero);
        var remainingPrincipal = loan.PrincipalAmount;

        for (var i = 1; i <= loan.TermMonths; i++)
        {
            var principal = i == loan.TermMonths ? remainingPrincipal : installmentPrincipal;
            remainingPrincipal -= principal;
            var interest = decimal.Round(principal * (loan.InterestRate / 100m), 2, MidpointRounding.AwayFromZero);
            var total = principal + interest;
            var dueDate = baseDate.AddMonths(i);

            const string insertSql = """
                insert into public.repayment_schedule (
                    id,
                    loan_id,
                    installment_no,
                    due_date,
                    due_principal,
                    due_interest,
                    due_total,
                    paid_amount,
                    status
                )
                values (
                    @Id,
                    @LoanId,
                    @InstallmentNo,
                    @DueDate,
                    @DuePrincipal,
                    @DueInterest,
                    @DueTotal,
                    0,
                    'Pending'
                );
                """;

            await connection.ExecuteAsync(new CommandDefinition(
                insertSql,
                new
                {
                    Id = Guid.NewGuid(),
                    LoanId = loan.Id,
                    InstallmentNo = i,
                    DueDate = dueDate.ToDateTime(TimeOnly.MinValue),
                    DuePrincipal = principal,
                    DueInterest = interest,
                    DueTotal = total
                },
                transaction,
                cancellationToken: cancellationToken));
        }
    }

    private async Task<LoanForUpdateRow?> GetLoanForUpdateAsync(IDbConnection connection, Guid loanId, IDbTransaction transaction, CancellationToken cancellationToken)
    {
        const string sql = """
            select id as Id,
                   application_id as ApplicationId,
                   principal_amount as PrincipalAmount,
                   outstanding_principal as OutstandingPrincipal,
                   interest_rate as InterestRate,
                   term_months as TermMonths,
                   status as Status
            from public.loans
            where id = @Id
            for update;
            """;

        var row = await connection.QuerySingleOrDefaultAsync<LoanForUpdateProjection>(new CommandDefinition(
            sql,
            new { Id = loanId },
            transaction,
            cancellationToken: cancellationToken));

        if (row is null)
        {
            return null;
        }

        return new LoanForUpdateRow(
            row.Id,
            row.ApplicationId,
            row.PrincipalAmount,
            row.OutstandingPrincipal,
            row.InterestRate,
            row.TermMonths,
            Enum.Parse<LoanStatus>(row.Status, true));
    }

    private async Task<LoanDetailsDto?> GetDetailsInternalAsync(IDbConnection connection, Guid loanId, CancellationToken cancellationToken)
    {
        const string loanSql = """
            select id as Id,
                   application_id as ApplicationId,
                   principal_amount as PrincipalAmount,
                   outstanding_principal as OutstandingPrincipal,
                   interest_rate as InterestRate,
                   term_months as TermMonths,
                   status as Status,
                   disbursed_at as DisbursedAt,
                   created_at as CreatedAt
            from public.loans
            where id = @Id;
            """;

        var loan = await connection.QuerySingleOrDefaultAsync<LoanDetailsRow>(new CommandDefinition(loanSql, new { Id = loanId }, cancellationToken: cancellationToken));
        if (loan is null)
        {
            return null;
        }

        const string scheduleSql = """
            select id as Id,
                   installment_no as InstallmentNo,
                   due_date as DueDate,
                   due_principal as DuePrincipal,
                   due_interest as DueInterest,
                   due_total as DueTotal,
                   paid_amount as PaidAmount,
                   status as Status,
                   paid_at as PaidAt
            from public.repayment_schedule
            where loan_id = @LoanId
            order by installment_no asc;
            """;

        const string repaymentsSql = """
            select id as Id,
                   amount as Amount,
                   principal_component as PrincipalComponent,
                   interest_component as InterestComponent,
                   paid_at as PaidAt,
                   payment_reference as PaymentReference
            from public.repayments
            where loan_id = @LoanId
            order by paid_at desc;
            """;

        var scheduleRows = await connection.QueryAsync<LoanScheduleRow>(new CommandDefinition(scheduleSql, new { LoanId = loanId }, cancellationToken: cancellationToken));
        var repaymentRows = await connection.QueryAsync<LoanRepaymentRow>(new CommandDefinition(repaymentsSql, new { LoanId = loanId }, cancellationToken: cancellationToken));

        var schedule = scheduleRows.Select(x => new LoanScheduleItemDto(
            x.Id,
            x.InstallmentNo,
            DateOnly.FromDateTime(x.DueDate),
            x.DuePrincipal,
            x.DueInterest,
            x.DueTotal,
            x.PaidAmount,
            x.Status,
            x.PaidAt is null ? null : new DateTimeOffset(DateTime.SpecifyKind(x.PaidAt.Value, DateTimeKind.Utc)))).ToArray();

        var repayments = repaymentRows.Select(x => new LoanRepaymentItemDto(
            x.Id,
            x.Amount,
            x.PrincipalComponent,
            x.InterestComponent,
            new DateTimeOffset(DateTime.SpecifyKind(x.PaidAt, DateTimeKind.Utc)),
            x.PaymentReference)).ToArray();

        return new LoanDetailsDto(
            loan.Id,
            loan.ApplicationId,
            loan.PrincipalAmount,
            loan.OutstandingPrincipal,
            loan.InterestRate,
            loan.TermMonths,
            Enum.Parse<LoanStatus>(loan.Status, true),
            loan.DisbursedAt is null ? null : new DateTimeOffset(DateTime.SpecifyKind(loan.DisbursedAt.Value, DateTimeKind.Utc)),
            new DateTimeOffset(DateTime.SpecifyKind(loan.CreatedAt, DateTimeKind.Utc)),
            schedule,
            repayments);
    }

    private async Task<LoanSecurityProjection?> GetLoanSecurityProjectionAsync(IDbConnection connection, Guid loanId, CancellationToken cancellationToken)
    {
        const string sql = """
            select l.id as LoanId,
                   c.user_id as ClientOwnerUserId,
                   la.assigned_to_user_id as AssignedToUserId
            from public.loans l
            join public.loan_applications la on la.id = l.application_id
            join public.clients c on c.id = la.client_id
            where l.id = @Id;
            """;

        return await connection.QuerySingleOrDefaultAsync<LoanSecurityProjection>(new CommandDefinition(sql, new { Id = loanId }, cancellationToken: cancellationToken));
    }

    private static void EnsureCanAccessLoan(IEnumerable<string> roles, Guid userId, LoanSecurityProjection projection)
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

        throw new UnauthorizedAccessException("User cannot access this loan.");
    }

    private static void EnsureStaffOnly(IEnumerable<string> roles)
    {
        if (!HasAnyRole(roles, StaffRoles))
        {
            throw new UnauthorizedAccessException("Only Admin or LoanOfficer can perform this action.");
        }
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

    private sealed record LoanForUpdateProjection(
        Guid Id,
        Guid ApplicationId,
        decimal PrincipalAmount,
        decimal OutstandingPrincipal,
        decimal InterestRate,
        int TermMonths,
        string Status
    );

    private sealed record LoanForUpdateRow(
        Guid Id,
        Guid ApplicationId,
        decimal PrincipalAmount,
        decimal OutstandingPrincipal,
        decimal InterestRate,
        int TermMonths,
        LoanStatus Status
    );

    private sealed record LoanDetailsRow(
        Guid Id,
        Guid ApplicationId,
        decimal PrincipalAmount,
        decimal OutstandingPrincipal,
        decimal InterestRate,
        int TermMonths,
        string Status,
        DateTime? DisbursedAt,
        DateTime CreatedAt
    );

    private sealed record LoanScheduleRow(
        Guid Id,
        int InstallmentNo,
        DateTime DueDate,
        decimal DuePrincipal,
        decimal DueInterest,
        decimal DueTotal,
        decimal PaidAmount,
        string Status,
        DateTime? PaidAt
    );

    private sealed record LoanRepaymentRow(
        Guid Id,
        decimal Amount,
        decimal PrincipalComponent,
        decimal InterestComponent,
        DateTime PaidAt,
        string? PaymentReference
    );

    private sealed record PortfolioRow(
        int TotalLoans,
        int ActiveLoans,
        decimal TotalPrincipal,
        decimal OutstandingPrincipal
    );

    private sealed record ArrearsRow(
        Guid LoanId,
        Guid ApplicationId,
        int InstallmentNo,
        DateTime DueDate,
        decimal DueTotal,
        decimal PaidAmount,
        decimal OutstandingAmount,
        int DaysOverdue
    );

    private sealed record RepaymentScheduleBalanceRow(Guid Id, decimal DueTotal, decimal PaidAmount);

    private sealed record LoanSecurityProjection(
        Guid LoanId,
        Guid? ClientOwnerUserId,
        Guid? AssignedToUserId
    );
}
