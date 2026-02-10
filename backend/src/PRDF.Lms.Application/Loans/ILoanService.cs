using PRDF.Lms.Application.Abstractions.Auth;

namespace PRDF.Lms.Application.Loans;

public interface ILoanService
{
    Task<LoanDetailsDto?> GetByIdAsync(CurrentUserContext actor, Guid loanId, CancellationToken cancellationToken);

    Task<LoanDetailsDto?> DisburseAsync(CurrentUserContext actor, Guid loanId, DisburseLoanRequest request, CancellationToken cancellationToken);

    Task<LoanDetailsDto?> RecordRepaymentAsync(CurrentUserContext actor, Guid loanId, RecordRepaymentRequest request, CancellationToken cancellationToken);

    Task<PortfolioSummaryDto> GetPortfolioSummaryAsync(CurrentUserContext actor, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ArrearsItemDto>> GetArrearsAsync(CurrentUserContext actor, CancellationToken cancellationToken);
}
