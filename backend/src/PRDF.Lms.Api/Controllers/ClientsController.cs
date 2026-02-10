using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Clients;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/clients")]
public sealed class ClientsController(
    ICurrentUserContextAccessor currentUserAccessor,
    IClientOnboardingService clientOnboardingService,
    IValidator<AssistedClientCreateRequest> assistedCreateValidator,
    IValidator<SendClientInviteRequest> inviteValidator) : ControllerBase
{
    [HttpPost("assisted")]
    public async Task<ActionResult<ClientSummaryDto>> CreateAssisted(
        [FromBody] AssistedClientCreateRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        var validation = await ValidateRequestAsync(assistedCreateValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var created = await clientOnboardingService.CreateAssistedClientAsync(actor, request, cancellationToken);
            return Ok(created);
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

    [HttpPost("{id:guid}/invite")]
    public async Task<ActionResult<InviteClientResponse>> SendInvite(
        [FromRoute] Guid id,
        [FromBody] SendClientInviteRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        var validation = await ValidateRequestAsync(inviteValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var response = await clientOnboardingService.SendInviteAsync(actor, id, request, cancellationToken);
            return response is null ? NotFound() : Ok(response);
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
