using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/operacion/reembolso")]
[Authorize]
public class LogisticaReembolsoController : ControllerBase
{
    private readonly ILogisticaReembolsoService _logisticaReembolsoService;

    public LogisticaReembolsoController(ILogisticaReembolsoService logisticaReembolsoService)
    {
        _logisticaReembolsoService = logisticaReembolsoService;
    }

    [HttpPost("buscar")]
    public async Task<IActionResult> Buscar(
        [FromBody] LogisticaReembolsoBuscarRequestDto request,
        CancellationToken cancellationToken)
    {
        var data = await _logisticaReembolsoService.BuscarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost("actualizar")]
    public async Task<IActionResult> Actualizar(
        [FromBody] LogisticaReembolsoUpdateRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.Correlativo <= 0)
        {
            return BadRequest(new { success = false, message = "Correlativo es obligatorio." });
        }

        try
        {
            await _logisticaReembolsoService.ActualizarAsync(request, cancellationToken);
            return Ok(new { success = true, message = "Reembolso actualizado correctamente." });
        }
        catch (NotSupportedException ex)
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                success = false,
                message = ex.Message,
            });
        }
    }
}
