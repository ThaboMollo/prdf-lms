using PRDF.Lms.Domain.Enums;

namespace PRDF.Lms.Application.Loans;

public sealed record DisburseLoanRequest(decimal Amount, string? Reference);

public sealed record RecordRepaymentRequest(decimal Amount, DateTimeOffset? PaidAt, string? PaymentReference);

public sealed record LoanRepaymentItemDto(
    Guid Id,
    decimal Amount,
    decimal PrincipalComponent,
    decimal InterestComponent,
    DateTimeOffset PaidAt,
    string? PaymentReference
);

public sealed record LoanScheduleItemDto(
    Guid Id,
    int InstallmentNo,
    DateOnly DueDate,
    decimal DuePrincipal,
    decimal DueInterest,
    decimal DueTotal,
    decimal PaidAmount,
    string Status,
    DateTimeOffset? PaidAt
);

public sealed record LoanDetailsDto(
    Guid Id,
    Guid ApplicationId,
    decimal PrincipalAmount,
    decimal OutstandingPrincipal,
    decimal InterestRate,
    int TermMonths,
    LoanStatus Status,
    DateTimeOffset? DisbursedAt,
    DateTimeOffset CreatedAt,
    IReadOnlyCollection<LoanScheduleItemDto> Schedule,
    IReadOnlyCollection<LoanRepaymentItemDto> Repayments
);

public sealed record PortfolioSummaryDto(
    int TotalLoans,
    int ActiveLoans,
    decimal TotalPrincipal,
    decimal OutstandingPrincipal,
    decimal RepaidPrincipal
);

public sealed record ArrearsItemDto(
    Guid LoanId,
    Guid ApplicationId,
    int InstallmentNo,
    DateOnly DueDate,
    decimal DueTotal,
    decimal PaidAmount,
    decimal OutstandingAmount,
    int DaysOverdue
);
