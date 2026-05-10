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
    public async Task<IActionResult> ObtenerDashboard([FromQuery] int topLogs = 200, CancellationToken cancellationToken = default)
    {
        var dashboard = await _reporteAutomaticoService.ObtenerDashboardAsync(GetUsuarioActual(), topLogs, cancellationToken);
        return Ok(new { success = true, message = "ok", data = dashboard });
    }

    [HttpGet("configuracion")]
    public async Task<IActionResult> ObtenerConfiguracion(CancellationToken cancellationToken)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var config = await _reporteAutomaticoService.ObtenerConfiguracionAsync(cancellationToken);
        return Ok(new { success = true, message = "ok", data = config });
    }

    [HttpPut("configuracion")]
    public async Task<IActionResult> ActualizarConfiguracion([FromBody] ReporteWhatsappConfiguracionUpdateDto request, CancellationToken cancellationToken)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        await _reporteAutomaticoService.ActualizarConfiguracionAsync(request, GetUsuarioActual(), cancellationToken);
        await _jobScheduler.ReprogramarAsync(cancellationToken);
        return Ok(new { success = true, message = "Configuración actualizada.", data = true });
    }

    [HttpPost("reprogramar-job")]
    public async Task<IActionResult> ReprogramarJob(CancellationToken cancellationToken)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        await _jobScheduler.ReprogramarAsync(cancellationToken);
        return Ok(new { success = true, message = "Job reprogramado correctamente.", data = true });
    }

    [HttpPost("ejecutar-ahora")]
    public async Task<IActionResult> EjecutarAhora(CancellationToken cancellationToken)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var dashboard = await _reporteAutomaticoService.ObtenerDashboardAsync(GetUsuarioActual(), 20, cancellationToken);
        if (dashboard.Runtime.IsRunning)
        {
            return Ok(new
            {
                success = true,
                message = "Ya existe una ejecución en curso.",
                data = new ReporteWhatsappEjecucionResultadoDto
                {
                    Accepted = false,
                    AlreadyRunning = true,
                    ExecutionId = dashboard.Runtime.ExecutionId,
                    Message = "Ya existe una ejecución de reporte WUP en curso."
                }
            });
        }

        var jobId = _jobScheduler.EncolarEjecucionManual(GetUsuarioActual());
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
    public async Task<IActionResult> ReintentarFallidos(CancellationToken cancellationToken)
    {
        if (!await UsuarioAutorizadoAsync(cancellationToken))
        {
            return Forbid();
        }

        var dashboard = await _reporteAutomaticoService.ObtenerDashboardAsync(GetUsuarioActual(), 20, cancellationToken);
        if (dashboard.Runtime.IsRunning)
        {
            return Ok(new
            {
                success = true,
                message = "Ya existe una ejecución en curso.",
                data = new ReporteWhatsappEjecucionResultadoDto
                {
                    Accepted = false,
                    AlreadyRunning = true,
                    ExecutionId = dashboard.Runtime.ExecutionId,
                    Message = "Ya existe una ejecución de reporte WUP en curso."
                }
            });
        }

        var jobId = _jobScheduler.EncolarReintentoFallidos(GetUsuarioActual());
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
