using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Loans;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public sealed class ReportsController(
    ICurrentUserContextAccessor currentUserAccessor,
    ILoanService loanService) : ControllerBase
{
    [HttpGet("portfolio")]
    public async Task<ActionResult<PortfolioSummaryDto>> GetPortfolio(CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var summary = await loanService.GetPortfolioSummaryAsync(actor, cancellationToken);
            return Ok(summary);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("arrears")]
    public async Task<ActionResult<IReadOnlyCollection<ArrearsItemDto>>> GetArrears(CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var items = await loanService.GetArrearsAsync(actor, cancellationToken);
            return Ok(items);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }
}
