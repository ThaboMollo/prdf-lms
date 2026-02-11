namespace PRDF.Lms.Application.Documents;

public sealed record DocumentRequirementDto(
    Guid Id,
    Guid? LoanProductId,
    string RequiredAtStatus,
    string DocType,
    bool IsRequired,
    DateTimeOffset CreatedAt
);

public sealed record CreateDocumentRequirementRequest(
    Guid? LoanProductId,
    string RequiredAtStatus,
    string DocType,
    bool IsRequired
);

public sealed record VerifyDocumentRequest(
    string Status,
    string? Note
);
