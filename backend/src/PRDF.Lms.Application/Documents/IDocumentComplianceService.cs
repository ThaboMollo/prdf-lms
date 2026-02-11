using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.Documents;

public interface IDocumentComplianceService
{
    Task<IReadOnlyCollection<DocumentRequirementDto>> ListRequirementsAsync(CurrentUserContext actor, CancellationToken cancellationToken);

    Task<DocumentRequirementDto> CreateRequirementAsync(CurrentUserContext actor, CreateDocumentRequirementRequest request, CancellationToken cancellationToken);

    Task VerifyDocumentAsync(CurrentUserContext actor, Guid applicationId, Guid documentId, string status, string? note, CancellationToken cancellationToken);
}
