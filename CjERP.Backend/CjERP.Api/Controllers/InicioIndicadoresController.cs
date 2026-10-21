using System.Security.Claims;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/inicio/indicadores")]
[Authorize]
public class InicioIndicadoresController : ControllerBase
{
    private readonly IInicioIndicadoresService _inicioIndicadoresService;

    public InicioIndicadoresController(IInicioIndicadoresService inicioIndicadoresService)
    {
        _inicioIndicadoresService = inicioIndicadoresService;
    }

    /// <summary>Indicador 0/1 de pendientes (OC y gastos) del empleado logueado (claim CodEmp).</summary>
    [HttpGet("pendientes")]
    public async Task<IActionResult> ObtenerPendientes(CancellationToken cancellationToken)
    {
        var idSolicitante = int.TryParse(User.FindFirstValue("CodEmp"), out var id) ? id : 0;
        var indicador = await _inicioIndicadoresService.ObtenerIndicadorPendientesAsync(idSolicitante, cancellationToken);
        return Ok(new { success = true, message = "ok", data = new { indicador } });
    }
}
