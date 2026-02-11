using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Loans;
using PRDF.Lms.Application.Reports;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public sealed class ReportsController(
    ICurrentUserContextAccessor currentUserAccessor,
    ILoanService loanService,
    IReportingService reportingService) : ControllerBase
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

    [HttpGet("audit")]
    public async Task<ActionResult<IReadOnlyCollection<AuditLogItemDto>>> GetAudit(
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        try
        {
            var rows = await reportingService.GetAuditLogAsync(actor, from, to, Math.Clamp(limit, 1, 1000), cancellationToken);
            return Ok(rows);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("turnaround")]
    public async Task<ActionResult<TurnaroundReportDto>> GetTurnaround(CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        try
        {
            var report = await reportingService.GetTurnaroundReportAsync(actor, cancellationToken);
            return Ok(report);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("pipeline-conversion")]
    public async Task<ActionResult<IReadOnlyCollection<PipelineConversionItemDto>>> GetPipelineConversion(CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        try
        {
            var report = await reportingService.GetPipelineConversionReportAsync(actor, cancellationToken);
            return Ok(report);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("productivity")]
    public async Task<ActionResult<IReadOnlyCollection<ProductivityItemDto>>> GetProductivity(CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        try
        {
            var report = await reportingService.GetProductivityReportAsync(actor, cancellationToken);
            return Ok(report);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }
}
