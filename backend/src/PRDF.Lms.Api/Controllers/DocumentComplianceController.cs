using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Documents;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/document-requirements")]
public sealed class DocumentComplianceController(
    ICurrentUserContextAccessor currentUserContextAccessor,
    IDocumentComplianceService documentComplianceService,
    IValidator<CreateDocumentRequirementRequest> createValidator,
    IValidator<VerifyDocumentRequest> verifyValidator) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<DocumentRequirementDto>>> ListRequirements(CancellationToken cancellationToken)
    {
        var actor = currentUserContextAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        try
        {
            var rows = await documentComplianceService.ListRequirementsAsync(actor, cancellationToken);
            return Ok(rows);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost]
    public async Task<ActionResult<DocumentRequirementDto>> CreateRequirement([FromBody] CreateDocumentRequirementRequest request, CancellationToken cancellationToken)
    {
        var actor = currentUserContextAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var validation = await ValidateRequestAsync(createValidator, request, cancellationToken);
        if (validation is not null) return validation;

        try
        {
            var created = await documentComplianceService.CreateRequirementAsync(actor, request, cancellationToken);
            return Ok(created);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("/api/applications/{applicationId:guid}/documents/{documentId:guid}/verify")]
    public async Task<IActionResult> VerifyDocument(
        [FromRoute] Guid applicationId,
        [FromRoute] Guid documentId,
        [FromBody] VerifyDocumentRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserContextAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var validation = await ValidateRequestAsync(verifyValidator, request, cancellationToken);
        if (validation is not null) return validation;

        try
        {
            await documentComplianceService.VerifyDocumentAsync(actor, applicationId, documentId, request.Status, request.Note, cancellationToken);
            return NoContent();
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private static async Task<ActionResult?> ValidateRequestAsync<T>(IValidator<T> validator, T request, CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(request, cancellationToken);
        if (result.IsValid) return null;

        var errors = result.Errors.Select(e => new { field = e.PropertyName, message = e.ErrorMessage }).ToArray();
        return new BadRequestObjectResult(new { error = "Validation failed.", details = errors });
    }
}
