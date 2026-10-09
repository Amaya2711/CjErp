using System.Security.Claims;
using CjERP.Api.Services;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

/// <summary>Job que actualiza la tabla de gastos del Excel en SharePoint (mismo acceso administrativo que el job de asistencia).</summary>
[ApiController]
[Route("api/admin/gastos-excel-sharepoint")]
[Authorize]
public sealed class GastosExcelSharePointController : ControllerBase
{
    private readonly IGastosExcelSharePointJobScheduler _scheduler;
    private readonly IGastosExcelSharePointRepository _repository;
    private readonly IReporteAutomaticoService _reporteAutomaticoService;

    public GastosExcelSharePointController(
        IGastosExcelSharePointJobScheduler scheduler,
        IGastosExcelSharePointRepository repository,
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
        [FromBody] GastosExcelSharePointConfigUpdateDto request,
        CancellationToken cancellationToken)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        try
        {
            await _scheduler.ActualizarConfiguracionAsync(request, UsuarioActual(), cancellationToken);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }

        return Ok(new { success = true, message = "Configuracion actualizada." });
    }

    [HttpPost("ejecutar")]
    public async Task<IActionResult> Ejecutar(CancellationToken cancellationToken)
    {
        if (!await TieneAccesoAsync(cancellationToken)) return Forbid();
        var jobId = _scheduler.EncolarEjecucionManual(UsuarioActual());
        return Accepted(new
        {
            success = true,
            accepted = true,
            jobId,
            message = "La actualizacion del Excel fue programada correctamente."
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
