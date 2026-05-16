using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/logistica/recojo")]
[Authorize]
public class LogisticaRecojoController : ControllerBase
{
    private readonly ILogisticaRecojoService _logisticaRecojoService;

    public LogisticaRecojoController(ILogisticaRecojoService logisticaRecojoService)
    {
        _logisticaRecojoService = logisticaRecojoService;
    }

    [HttpPost("buscar")]
    public async Task<IActionResult> Buscar(
        [FromBody] LogisticaRecojoBuscarRequestDto request,
        CancellationToken cancellationToken)
    {
        var data = await _logisticaRecojoService.BuscarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost("insertar")]
    public async Task<IActionResult> Insertar(
        [FromBody] LogisticaRecojoInsertRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdCliente <= 0)
        {
            return BadRequest(new { success = false, message = "Cliente es obligatorio." });
        }

        if (request.IdProyecto <= 0)
        {
            return BadRequest(new { success = false, message = "Proyecto es obligatorio." });
        }

        if (string.IsNullOrWhiteSpace(request.IdSite))
        {
            return BadRequest(new { success = false, message = "Site es obligatorio." });
        }

        if (request.Correlativo <= 0)
        {
            return BadRequest(new { success = false, message = "Correlativo es obligatorio." });
        }

        if (string.IsNullOrWhiteSpace(request.UsuarioCreacion))
        {
            request.UsuarioCreacion =
                User.FindFirstValue("IdUsuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.Identity?.Name
                ?? "sistema";
        }

        var idRecojo = await _logisticaRecojoService.InsertarAsync(request, cancellationToken);
        return Ok(new
        {
            success = true,
            message = "Recojo creado correctamente.",
            data = new { idRecojo }
        });
    }
}
