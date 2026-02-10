using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Tasks;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/tasks")]
public sealed class TasksController(
    ICurrentUserContextAccessor currentUserAccessor,
    ITaskService taskService,
    IValidator<CreateTaskRequest> createValidator,
    IValidator<UpdateTaskRequest> updateValidator,
    IValidator<CompleteTaskRequest> completeValidator) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<TaskItemDto>>> List(
        [FromQuery] Guid? applicationId,
        [FromQuery] bool assignedToMe,
        CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var tasks = await taskService.ListTasksAsync(actor, applicationId, assignedToMe, cancellationToken);
        return Ok(tasks);
    }

    [HttpPost]
    public async Task<ActionResult<TaskItemDto>> Create([FromBody] CreateTaskRequest request, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var validation = await ValidateRequestAsync(createValidator, request, cancellationToken);
        if (validation is not null) return validation;

        try
        {
            var created = await taskService.CreateTaskAsync(actor, request, cancellationToken);
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

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TaskItemDto>> Update([FromRoute] Guid id, [FromBody] UpdateTaskRequest request, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var validation = await ValidateRequestAsync(updateValidator, request, cancellationToken);
        if (validation is not null) return validation;

        try
        {
            var updated = await taskService.UpdateTaskAsync(actor, id, request, cancellationToken);
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

    [HttpPost("{id:guid}/complete")]
    public async Task<ActionResult<TaskItemDto>> Complete([FromRoute] Guid id, [FromBody] CompleteTaskRequest request, CancellationToken cancellationToken)
    {
        var actor = currentUserAccessor.GetCurrentUser();
        if (actor is null) return Unauthorized();

        var validation = await ValidateRequestAsync(completeValidator, request, cancellationToken);
        if (validation is not null) return validation;

        try
        {
            var completed = await taskService.CompleteTaskAsync(actor, id, request.Note, cancellationToken);
            return completed is null ? NotFound() : Ok(completed);
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

    private static async Task<ActionResult?> ValidateRequestAsync<T>(IValidator<T> validator, T request, CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(request, cancellationToken);
        if (result.IsValid) return null;

        var errors = result.Errors
            .Select(e => new { field = e.PropertyName, message = e.ErrorMessage })
            .ToArray();

        return new BadRequestObjectResult(new { error = "Validation failed.", details = errors });
    }
}
