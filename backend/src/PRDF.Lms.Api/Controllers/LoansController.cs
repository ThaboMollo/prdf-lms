using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Loans;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/loans")]
public sealed class LoansController(
    ICurrentUserContextAccessor currentUserAccessor,
    ILoanService loanService,
    IValidator<DisburseLoanRequest> disburseValidator,
    IValidator<RecordRepaymentRequest> repaymentValidator) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<LoanDetailsDto>> GetById([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var loan = await loanService.GetByIdAsync(actor, id, cancellationToken);
            return loan is null ? NotFound() : Ok(loan);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("{id:guid}/disburse")]
    public async Task<ActionResult<LoanDetailsDto>> Disburse(
        [FromRoute] Guid id,
        [FromBody] DisburseLoanRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        var validation = await ValidateRequestAsync(disburseValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var loan = await loanService.DisburseAsync(actor, id, request, cancellationToken);
            return loan is null ? NotFound() : Ok(loan);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is ArgumentException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/repayments")]
    public async Task<ActionResult<LoanDetailsDto>> RecordRepayment(
        [FromRoute] Guid id,
        [FromBody] RecordRepaymentRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        var validation = await ValidateRequestAsync(repaymentValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var loan = await loanService.RecordRepaymentAsync(actor, id, request, cancellationToken);
            return loan is null ? NotFound() : Ok(loan);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is ArgumentException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private static async Task<ActionResult?> ValidateRequestAsync<T>(
        IValidator<T> validator,
        T request,
        CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(request, cancellationToken);
        if (result.IsValid)
        {
            return null;
        }

        var errors = result.Errors
            .Select(e => new { field = e.PropertyName, message = e.ErrorMessage })
            .ToArray();

        return new BadRequestObjectResult(new
        {
            error = "Validation failed.",
            details = errors
        });
    }
}
