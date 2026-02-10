using PRDF.Lms.Domain.Enums;

namespace PRDF.Lms.Application.Applications;

public sealed record ApplicationListItemDto(
    Guid Id,
    Guid ClientId,
    decimal RequestedAmount,
    int TermMonths,
    string Purpose,
    LoanApplicationStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? SubmittedAt,
    Guid? AssignedToUserId
);

public sealed record ApplicationDetailsDto(
    Guid Id,
    Guid ClientId,
    decimal RequestedAmount,
    int TermMonths,
    string Purpose,
    LoanApplicationStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? SubmittedAt,
    Guid? AssignedToUserId
);

public sealed record ApplicationStatusHistoryItemDto(
    Guid Id,
    Guid ApplicationId,
    LoanApplicationStatus? FromStatus,
    LoanApplicationStatus ToStatus,
    Guid ChangedBy,
    DateTimeOffset ChangedAt,
    string? Note
);

public sealed record ApplicationDocumentDto(
    Guid Id,
    Guid ApplicationId,
    string DocType,
    string StoragePath,
    string Status,
    Guid UploadedBy,
    DateTimeOffset UploadedAt
);

public sealed record PresignUploadResponse(
    string Bucket,
    string StoragePath,
    string UploadUrl,
    int ExpiresInSeconds
);

public sealed record CreateLoanApplicationRequest(
    Guid? ClientId,
    decimal RequestedAmount,
    int TermMonths,
    string Purpose,
    string? BusinessName,
    string? RegistrationNo,
    string? Address,
    Guid? AssignedToUserId
);

public sealed record UpdateLoanApplicationRequest(
    decimal RequestedAmount,
    int TermMonths,
    string Purpose,
    Guid? AssignedToUserId
);

public sealed record SubmitLoanApplicationRequest(string? Note);

public sealed record PresignDocumentUploadRequest(string DocType, string FileName, string? ContentType);

public sealed record ConfirmDocumentUploadRequest(string DocType, string StoragePath, string Status);

public sealed record ChangeApplicationStatusRequest(LoanApplicationStatus ToStatus, string? Note);
