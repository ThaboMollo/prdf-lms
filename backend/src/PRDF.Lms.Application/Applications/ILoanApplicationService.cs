using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Domain.Enums;

namespace PRDF.Lms.Application.Applications;

public interface ILoanApplicationService
{
    Task<ApplicationDetailsDto> CreateDraftAsync(CurrentUserContext actor, CreateLoanApplicationRequest request, CancellationToken cancellationToken);

    Task<ApplicationDetailsDto?> UpdateDraftAsync(CurrentUserContext actor, Guid applicationId, UpdateLoanApplicationRequest request, CancellationToken cancellationToken);

    Task<ApplicationDetailsDto?> SubmitAsync(CurrentUserContext actor, Guid applicationId, string? note, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ApplicationListItemDto>> ListAsync(CurrentUserContext actor, CancellationToken cancellationToken);

    Task<ApplicationDetailsDto?> GetByIdAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken);

    Task<PresignUploadResponse?> PresignDocumentUploadAsync(CurrentUserContext actor, Guid applicationId, PresignDocumentUploadRequest request, CancellationToken cancellationToken);

    Task<ApplicationDocumentDto?> ConfirmDocumentUploadAsync(CurrentUserContext actor, Guid applicationId, ConfirmDocumentUploadRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ApplicationDocumentDto>> ListDocumentsAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken);

    Task<ApplicationDetailsDto?> ChangeStatusAsync(CurrentUserContext actor, Guid applicationId, LoanApplicationStatus toStatus, string? note, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ApplicationStatusHistoryItemDto>> GetHistoryAsync(CurrentUserContext actor, Guid applicationId, CancellationToken cancellationToken);
}
