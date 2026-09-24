using System.Security.Claims;
using CjERP.Api.Services;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/admin/asistencia-sharepoint")]
[Authorize]
public sealed class AsistenciaSharePointController : ControllerBase
{
    private readonly IAsistenciaSharePointJobScheduler _scheduler;
    private readonly IAsistenciaSharePointRepository _repository;
    private readonly IReporteAutomaticoService _reporteAutomaticoService;

    public AsistenciaSharePointController(
        IAsistenciaSharePointJobScheduler scheduler,
        IAsistenciaSharePointRepository repository,
        IReporteAutomaticoService reporteAutomaticoService)
    {
        _scheduler = scheduler;
        _repository = repository;
        _reporteAutomaticoService = reporteAutomaticoService;
    }

    [HttpGet("configuracion")]
    public async Task<IActionResult> ObtenerConfiguracion(CancellationToken cancellationToken)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        return Ok(new { success = true, data = await _scheduler.ObtenerConfiguracionAsync(cancellationToken) });
    }

    [HttpPut("configuracion")]
    public async Task<IActionResult> ActualizarConfiguracion(
        [FromBody] AsistenciaSharePointConfigUpdateDto request,
        CancellationToken cancellationToken)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        await _scheduler.ActualizarConfiguracionAsync(request, UsuarioActual(), cancellationToken);
        return Ok(new { success = true, message = "Configuracion actualizada." });
    }

    [HttpPost("ejecutar")]
    public async Task<IActionResult> Ejecutar(
        [FromBody] AsistenciaSharePointEjecucionRequestDto request,
        CancellationToken cancellationToken)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        var jobId = _scheduler.EncolarEjecucionManual(request.FechaInicio, request.FechaFin, UsuarioActual());
        await Task.CompletedTask;
        return Accepted(new
        {
            success = true,
            accepted = true,
            jobId,
            message = "La exportacion fue programada correctamente."
        });
    }

    [HttpGet("historial")]
    public async Task<IActionResult> Historial([FromQuery] int top = 100, CancellationToken cancellationToken = default)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        return Ok(new { success = true, data = await _repository.ObtenerHistorialAsync(top, cancellationToken) });
    }

    [HttpPost("historial/{id:long}/reintentar")]
    public async Task<IActionResult> Reintentar(long id, CancellationToken cancellationToken)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        var jobId = await _scheduler.EncolarReintentoAsync(id, UsuarioActual(), cancellationToken);
        if (jobId is null)
        {
            return BadRequest(new { success = false, message = "Solo se pueden reintentar ejecuciones con estado ERROR." });
        }

        return Accepted(new { success = true, accepted = true, jobId, message = "El reintento fue programado correctamente." });
    }

    private string UsuarioActual() =>
        User.FindFirstValue("IdUsuario")
        ?? User.FindFirstValue(ClaimTypes.Name)
        ?? User.Identity?.Name
        ?? "SISTEMA";

    private Task<bool> TieneAccesoAsync(CancellationToken cancellationToken) =>
        _reporteAutomaticoService.UsuarioTieneAccesoAdministrativoAsync(UsuarioActual(), cancellationToken);
}
