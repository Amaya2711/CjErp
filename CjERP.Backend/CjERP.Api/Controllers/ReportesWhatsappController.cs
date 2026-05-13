using System.Security.Claims;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/reportes-whatsapp")]
[Authorize]
public sealed class ReportesWhatsappController : ControllerBase
{
    private readonly IReporteAutomaticoService _reporteAutomaticoService;
    private readonly IReporteWhatsappJobScheduler _jobScheduler;

    public ReportesWhatsappController(
        IReporteAutomaticoService reporteAutomaticoService,
        IReporteWhatsappJobScheduler jobScheduler)
    {
        _reporteAutomaticoService = reporteAutomaticoService;
        _jobScheduler = jobScheduler;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> ObtenerDashboard([FromQuery] string? tipo = null, [FromQuery] int topLogs = 200, CancellationToken cancellationToken = default)
    {
        var normalizedType = ResolveTipo(tipo);
        var dashboard = await _reporteAutomaticoService.ObtenerDashboardAsync(GetUsuarioActual(), normalizedType, topLogs, cancellationToken);
        return Ok(new { success = true, message = "ok", data = dashboard });
    }

    [HttpGet("configuracion")]
    public async Task<IActionResult> ObtenerConfiguracion([FromQuery] string? tipo = null, CancellationToken cancellationToken = default)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var normalizedType = ResolveTipo(tipo);
        var config = await _reporteAutomaticoService.ObtenerConfiguracionAsync(normalizedType, cancellationToken);
        return Ok(new { success = true, message = "ok", data = config });
    }

    [HttpPut("configuracion")]
    public async Task<IActionResult> ActualizarConfiguracion([FromBody] ReporteWhatsappConfiguracionUpdateDto request, CancellationToken cancellationToken, [FromQuery] string? tipo = null)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        request.TipoReporte = ResolveTipo(tipo, request.TipoReporte);
        await _reporteAutomaticoService.ActualizarConfiguracionAsync(request, GetUsuarioActual(), cancellationToken);
        await _jobScheduler.ReprogramarAsync(request.TipoReporte, cancellationToken);
        return Ok(new { success = true, message = "Configuracion actualizada.", data = true });
    }

    [HttpPost("reprogramar-job")]
    public async Task<IActionResult> ReprogramarJob([FromQuery] string? tipo = null, CancellationToken cancellationToken = default)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var normalizedType = ResolveTipo(tipo);
        await _jobScheduler.ReprogramarAsync(normalizedType, cancellationToken);
        return Ok(new { success = true, message = "Job reprogramado correctamente.", data = true });
    }

    [HttpPost("ejecutar-ahora")]
    public async Task<IActionResult> EjecutarAhora([FromQuery] string? tipo = null, CancellationToken cancellationToken = default)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var normalizedType = ResolveTipo(tipo);
        var dashboard = await _reporteAutomaticoService.ObtenerDashboardAsync(GetUsuarioActual(), normalizedType, 20, cancellationToken);
        if (dashboard.Runtime.IsRunning)
        {
            return Ok(new
            {
                success = true,
                message = "Ya existe una ejecucion en curso.",
                data = new ReporteWhatsappEjecucionResultadoDto
                {
                    Accepted = false,
                    AlreadyRunning = true,
                    ExecutionId = dashboard.Runtime.ExecutionId,
                    Message = "Ya existe una ejecucion de reporte WUP en curso."
                }
            });
        }

        var jobId = _jobScheduler.EncolarEjecucionManual(normalizedType, GetUsuarioActual());
        return Ok(new
        {
            success = true,
            message = "Proceso encolado correctamente.",
            data = new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = true,
                JobId = jobId,
                Message = "Proceso manual encolado correctamente."
            }
        });
    }

    [HttpPost("reintentar-fallidos")]
    public async Task<IActionResult> ReintentarFallidos([FromQuery] string? tipo = null, CancellationToken cancellationToken = default)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var normalizedType = ResolveTipo(tipo);
        var dashboard = await _reporteAutomaticoService.ObtenerDashboardAsync(GetUsuarioActual(), normalizedType, 20, cancellationToken);
        if (dashboard.Runtime.IsRunning)
        {
            return Ok(new
            {
                success = true,
                message = "Ya existe una ejecucion en curso.",
                data = new ReporteWhatsappEjecucionResultadoDto
                {
                    Accepted = false,
                    AlreadyRunning = true,
                    ExecutionId = dashboard.Runtime.ExecutionId,
                    Message = "Ya existe una ejecucion de reporte WUP en curso."
                }
            });
        }

        var jobId = _jobScheduler.EncolarReintentoFallidos(normalizedType, GetUsuarioActual());
        return Ok(new
        {
            success = true,
            message = "Reintento encolado correctamente.",
            data = new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = true,
                JobId = jobId,
                Message = "Reintento de fallidos encolado correctamente."
            }
        });
    }

    private static string ResolveTipo(string? tipo, string? fallback = null) =>
        ReporteWhatsappTipos.Normalize(string.IsNullOrWhiteSpace(tipo) ? fallback : tipo);

    private string GetUsuarioActual()
    {
        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "SISTEMA";
    }

    private Task<bool> UsuarioAutorizadoAsync(CancellationToken cancellationToken)
    {
        return _reporteAutomaticoService.UsuarioTieneAccesoAdministrativoAsync(GetUsuarioActual(), cancellationToken);
    }
}
