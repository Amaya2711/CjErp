using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/auditoria-cambios")]
[Authorize]
public class AuditoriaCambiosController : ControllerBase
{
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public AuditoriaCambiosController(IAuditoriaCambiosService auditoriaCambiosService)
    {
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    [HttpGet]
    public async Task<IActionResult> Consultar(
        [FromQuery] AuditoriaCambioFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var data = await _auditoriaCambiosService.ConsultarAsync(filtro, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }
}
