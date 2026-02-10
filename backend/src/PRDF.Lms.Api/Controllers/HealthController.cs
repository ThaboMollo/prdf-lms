using Microsoft.AspNetCore.Mvc;

namespace PRDF.Lms.Api.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { status = "ok", service = "PRDF.Lms.Api" });
    }
}
