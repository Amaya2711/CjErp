using CjERP.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/reportes/gerencial")]
[Authorize]
public class ReportesGerencialesController : ControllerBase
{
    private readonly ILookupService _lookupService;

    public ReportesGerencialesController(ILookupService lookupService)
    {
        _lookupService = lookupService;
    }

    [HttpGet("mapasite")]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Client)]
    public async Task<IActionResult> GetMapaSite(
        [FromQuery] string? nombreSite,
        [FromQuery] string? departamento,
        [FromQuery] string? cliente,
        [FromQuery] string? proyecto,
        CancellationToken cancellationToken)
    {
        var data = await _lookupService.ListarMapaSiteAsync(nombreSite, departamento, cliente, proyecto, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("mapapersonal")]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Client)]
    public async Task<IActionResult> GetMapaPersonal(CancellationToken cancellationToken)
    {
        var data = await _lookupService.ListarMapaPersonalAsync(cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }
}
