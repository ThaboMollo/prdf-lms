using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.Reports;

public interface IReportingService
{
    Task<IReadOnlyCollection<AuditLogItemDto>> GetAuditLogAsync(CurrentUserContext actor, DateTimeOffset? from, DateTimeOffset? to, int limit, CancellationToken cancellationToken);

    Task<TurnaroundReportDto> GetTurnaroundReportAsync(CurrentUserContext actor, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<PipelineConversionItemDto>> GetPipelineConversionReportAsync(CurrentUserContext actor, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ProductivityItemDto>> GetProductivityReportAsync(CurrentUserContext actor, CancellationToken cancellationToken);
}
