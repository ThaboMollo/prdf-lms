using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FluentValidation;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Applications;
using PRDF.Lms.Application.Tasks;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/applications")]
public sealed class ApplicationsController(
    ICurrentUserContextAccessor currentUserAccessor,
    ILoanApplicationService loanApplicationService,
    IValidator<CreateLoanApplicationRequest> createValidator,
    IValidator<UpdateLoanApplicationRequest> updateValidator,
    IValidator<SubmitLoanApplicationRequest> submitValidator,
    IValidator<PresignDocumentUploadRequest> presignValidator,
    IValidator<ConfirmDocumentUploadRequest> confirmValidator,
    IValidator<ChangeApplicationStatusRequest> statusValidator,
    ITaskService taskService,
    IValidator<CreateNoteRequest> createNoteValidator) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ApplicationDetailsDto>> CreateDraft(
        [FromBody] CreateLoanApplicationRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(createValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var created = await loanApplicationService.CreateDraftAsync(actor, request, cancellationToken);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
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

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApplicationDetailsDto>> UpdateDraft(
        [FromRoute] Guid id,
        [FromBody] UpdateLoanApplicationRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(updateValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var updated = await loanApplicationService.UpdateDraftAsync(actor, id, request, cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
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

    [HttpPost("{id:guid}/submit")]
    public async Task<ActionResult<ApplicationDetailsDto>> Submit(
        [FromRoute] Guid id,
        [FromBody] SubmitLoanApplicationRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(submitValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var submitted = await loanApplicationService.SubmitAsync(actor, id, request.Note, cancellationToken);
            return submitted is null ? NotFound() : Ok(submitted);
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

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<ApplicationListItemDto>>> List(CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        var applications = await loanApplicationService.ListAsync(actor, cancellationToken);
        return Ok(applications);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApplicationDetailsDto>> GetById([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var application = await loanApplicationService.GetByIdAsync(actor, id, cancellationToken);
            return application is null ? NotFound() : Ok(application);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("{id:guid}/documents/presign-upload")]
    public async Task<ActionResult<PresignUploadResponse>> PresignUpload(
        [FromRoute] Guid id,
        [FromBody] PresignDocumentUploadRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(presignValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var response = await loanApplicationService.PresignDocumentUploadAsync(actor, id, request, cancellationToken);
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

    [HttpPost("{id:guid}/documents/confirm")]
    public async Task<ActionResult<ApplicationDocumentDto>> ConfirmUpload(
        [FromRoute] Guid id,
        [FromBody] ConfirmDocumentUploadRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(confirmValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var document = await loanApplicationService.ConfirmDocumentUploadAsync(actor, id, request, cancellationToken);
            return document is null ? NotFound() : Ok(document);
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

    [HttpGet("{id:guid}/documents")]
    public async Task<ActionResult<IReadOnlyCollection<ApplicationDocumentDto>>> GetDocuments([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var documents = await loanApplicationService.ListDocumentsAsync(actor, id, cancellationToken);
            return Ok(documents);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("{id:guid}/status")]
    public async Task<ActionResult<ApplicationDetailsDto>> ChangeStatus(
        [FromRoute] Guid id,
        [FromBody] ChangeApplicationStatusRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(statusValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var updated = await loanApplicationService.ChangeStatusAsync(actor, id, request.ToStatus, request.Note, cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
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

    [HttpGet("{id:guid}/history")]
    public async Task<ActionResult<IReadOnlyCollection<ApplicationStatusHistoryItemDto>>> GetHistory([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var history = await loanApplicationService.GetHistoryAsync(actor, id, cancellationToken);
            return Ok(history);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("{id:guid}/notes")]
    public async Task<ActionResult<IReadOnlyCollection<NoteItemDto>>> GetNotes([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }

        try
        {
            var notes = await taskService.ListNotesAsync(actor, id, cancellationToken);
            return Ok(notes);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("{id:guid}/notes")]
    public async Task<ActionResult<NoteItemDto>> CreateNote(
        [FromRoute] Guid id,
        [FromBody] CreateNoteRequest request,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null)
        {
            return Unauthorized();
        }
        var validation = await ValidateRequestAsync(createNoteValidator, request, cancellationToken);
        if (validation is not null)
        {
            return validation;
        }

        try
        {
            var created = await taskService.CreateNoteAsync(actor, id, request.Body, cancellationToken);
            return created is null ? NotFound() : Ok(created);
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
