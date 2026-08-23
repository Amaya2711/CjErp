using CjERP.Api.Jobs;
using CjERP.Application.DTOs;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Security.Claims;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/asistencia/reporte")]
[Authorize]
public class AsistenciaReporteController : ControllerBase
{
    private readonly IAsistenciaReporteService _asistenciaReporteService;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly ILogger<AsistenciaReporteController> _logger;

    public AsistenciaReporteController(
        IAsistenciaReporteService asistenciaReporteService,
        IBackgroundJobClient backgroundJobClient,
        ILogger<AsistenciaReporteController> logger)
    {
        _asistenciaReporteService = asistenciaReporteService;
        _backgroundJobClient = backgroundJobClient;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Buscar(
        [FromQuery] AsistenciaReporteRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FechaInicio) || string.IsNullOrWhiteSpace(request.FechaFin))
        {
            return BadRequest(new { success = false, message = "FechaInicio y FechaFin son obligatorias." });
        }

        var data = await _asistenciaReporteService.BuscarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost("pdf-empleado")]
    public async Task<IActionResult> ExportarPdfEmpleado(
        [FromBody] AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FechaInicio) || string.IsNullOrWhiteSpace(request.FechaFin))
        {
            return BadRequest(new { success = false, message = "FechaInicio y FechaFin son obligatorias." });
        }

        var pdfBytes = await _asistenciaReporteService.GenerarPdfGerencialAsync(request, cancellationToken);
        var fileName = $"reporte_asistencia_{request.FechaInicio.Replace("/", string.Empty)}_{request.FechaFin.Replace("/", string.Empty)}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }

    [HttpPost("pdf-empleado-validacion")]
    public async Task<IActionResult> ExportarPdfEmpleadoValidacion(
        [FromBody] AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FechaInicio) || string.IsNullOrWhiteSpace(request.FechaFin))
        {
            return BadRequest(new { success = false, message = "FechaInicio y FechaFin son obligatorias." });
        }

        if (request.Items is null || request.Items.Count == 0)
        {
            return BadRequest(new { success = false, message = "No existen registros filtrados para generar el PDF de validacion." });
        }

        try
        {
            var pdfBytes = await _asistenciaReporteService.GenerarPdfEmpleadoValidacionAsync(request, cancellationToken);
            var fileName = $"reporte_asistencia_validacion_{request.FechaInicio.Replace("/", string.Empty)}_{request.FechaFin.Replace("/", string.Empty)}.pdf";
            return File(pdfBytes, "application/pdf", fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generando el PDF de validacion de asistencia.");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo generar el PDF de validacion.",
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("pdf-empleado-llamada-atencion")]
    public async Task<IActionResult> ExportarPdfEmpleadoLlamadaAtencion(
        [FromBody] AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FechaInicio) || string.IsNullOrWhiteSpace(request.FechaFin))
        {
            return BadRequest(new { success = false, message = "FechaInicio y FechaFin son obligatorias." });
        }

        if (request.Items is null || request.Items.Count == 0)
        {
            return BadRequest(new { success = false, message = "No existen registros filtrados para generar la llamada de atencion." });
        }

        var empleadoId = request.Items
            .Select(item => item.IdEmpleado)
            .FirstOrDefault(id => id.HasValue && id.Value > 0);

        if (empleadoId is not int idEmpleadoValido)
        {
            return BadRequest(new { success = false, message = "No se pudo identificar el empleado para validar la llamada de atencion." });
        }

        if (await _asistenciaReporteService.ExistePdfLlamadaAtencionEnviadoHoyAsync(idEmpleadoValido, cancellationToken))
        {
            return Conflict(new { success = false, message = "La llamada de atencion ya fue generada o enviada hoy para este empleado." });
        }

        try
        {
            var usuarioEjecucion =
                User.FindFirstValue("Usuario")
                ?? User.FindFirstValue("usuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.FindFirstValue("unique_name")
                ?? User.Identity?.Name
                ?? "SISTEMA";

            var pdfBytes = await _asistenciaReporteService.GenerarPdfEmpleadoLlamadaAtencionAsync(request, usuarioEjecucion, cancellationToken);
            var fileName = $"notificacion_asistencia_{request.FechaInicio.Replace("/", string.Empty)}_{request.FechaFin.Replace("/", string.Empty)}.pdf";
            return File(pdfBytes, "application/pdf", fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generando el PDF de llamada de atencion de asistencia.");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo generar el PDF de llamada de atencion.",
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("pdf-empleado-llamada-atencion/enviar")]
    public async Task<IActionResult> EnviarPdfEmpleadoLlamadaAtencion(
        [FromBody] AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FechaInicio) || string.IsNullOrWhiteSpace(request.FechaFin))
        {
            return BadRequest(new { success = false, message = "FechaInicio y FechaFin son obligatorias." });
        }

        if (request.Items is null || request.Items.Count == 0)
        {
            return BadRequest(new { success = false, message = "No existen registros filtrados para enviar la llamada de atencion." });
        }

        var empleadoId = request.Items
            .Select(item => item.IdEmpleado)
            .FirstOrDefault(id => id.HasValue && id.Value > 0);

        if (empleadoId is not int idEmpleadoValido)
        {
            return BadRequest(new { success = false, message = "No se pudo identificar el empleado para enviar la llamada de atencion." });
        }

        if (await _asistenciaReporteService.ExistePdfLlamadaAtencionEnviadoHoyAsync(idEmpleadoValido, cancellationToken))
        {
            return Conflict(new { success = false, message = "La llamada de atencion ya fue generada o enviada hoy para este empleado." });
        }

        try
        {
            var usuarioEjecucion =
                User.FindFirstValue("Usuario")
                ?? User.FindFirstValue("usuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.FindFirstValue("unique_name")
                ?? User.Identity?.Name
                ?? "SISTEMA";

            // Generar el PDF y conectarse al servidor SMTP puede tardar mas que la
            // ventana HTTP disponible en produccion. Hangfire persiste el trabajo
            // antes de responder y permite que continue aunque el navegador cierre
            // la peticion.
            var jobId = _backgroundJobClient.Enqueue<AsistenciaReporteJob>(job =>
                job.EnviarPdfEmpleadoLlamadaAtencionAsync(request, usuarioEjecucion));

            return Accepted(new
            {
                success = true,
                message = "El envio del PDF fue programado correctamente.",
                data = new ReporteWhatsappEjecucionResultadoDto
                {
                    Accepted = true,
                    JobId = jobId,
                    Message = "El envio del PDF fue programado correctamente."
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando el PDF de llamada de atencion de asistencia.");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo enviar el PDF de llamada de atencion por correo.",
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("pdf-empleado-llamada-atencion/preview")]
    public async Task<IActionResult> PrevisualizarPdfEmpleadoLlamadaAtencion(
        [FromBody] AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FechaInicio) || string.IsNullOrWhiteSpace(request.FechaFin))
        {
            return BadRequest(new { success = false, message = "FechaInicio y FechaFin son obligatorias." });
        }

        if (request.Items is null || request.Items.Count == 0)
        {
            return BadRequest(new { success = false, message = "No existen registros filtrados para generar la llamada de atencion." });
        }

        try
        {
            var pdfBytes = await _asistenciaReporteService.GenerarPdfEmpleadoLlamadaAtencionVistaPreviaAsync(request, cancellationToken);
            var fileName = $"notificacion_asistencia_{request.FechaInicio.Replace("/", string.Empty)}_{request.FechaFin.Replace("/", string.Empty)}.pdf";
            return File(pdfBytes, "application/pdf", fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generando la vista previa del PDF de llamada de atencion de asistencia.");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo generar la vista previa de la llamada de atencion.",
                detail = ex.ToString()
            });
        }
    }

    [HttpGet("llamada-atencion/enviada-hoy/{idEmpleado:int}")]
    public async Task<IActionResult> ValidarLlamadaAtencionEnviadaHoy(
        [FromRoute] int idEmpleado,
        CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "El IdEmpleado no es valido." });
        }

        var enviadaHoy = await _asistenciaReporteService.ExistePdfLlamadaAtencionEnviadoHoyAsync(idEmpleado, cancellationToken);
        return Ok(new { success = true, data = new { enviadaHoy } });
    }

    [HttpPost("llamada-atencion/enviada-hoy")]
    public async Task<IActionResult> ValidarLlamadaAtencionEnviadaHoyEnLote(
        [FromBody] AsistenciaLlamadaAtencionEstadoRequestDto request,
        CancellationToken cancellationToken)
    {
        var ids = request.IdsEmpleado?
            .Where(id => id > 0)
            .Distinct()
            .ToArray() ?? Array.Empty<int>();

        if (ids.Length == 0)
        {
            return Ok(new { success = true, data = new { enviadosHoyIds = Array.Empty<int>() } });
        }

        var enviadosHoyIds = await _asistenciaReporteService.ObtenerPdfLlamadaAtencionEnviadosHoyAsync(ids, cancellationToken);
        return Ok(new { success = true, data = new { enviadosHoyIds } });
    }

    [HttpPost("pdf-gerencial")]
    public async Task<IActionResult> ExportarPdfGerencial(
        [FromBody] AsistenciaGerencialPdfRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var reporte = await _asistenciaReporteService.ObtenerReporteGerencialAsync(request, cancellationToken);
            if (reporte.Kpis.TotalRegistros <= 0)
            {
                return BadRequest(new { success = false, message = "No existen datos para generar el PDF gerencial." });
            }

            var pdfBytes = await _asistenciaReporteService.GenerarPdfGerencialEjecutivoAsync(request, cancellationToken);
            return File(pdfBytes, "application/pdf", reporte.NombreArchivo);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPut("estado-marcacion")]
    public async Task<IActionResult> ActualizarEstadoMarcacion(
        [FromBody] AsistenciaActualizarEstadoMarcacionRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdEmpleado is null or <= 0)
        {
            return BadRequest(new { success = false, message = "El IdEmpleado es obligatorio." });
        }

        if (string.IsNullOrWhiteSpace(request.FechaAsistencia))
        {
            return BadRequest(new { success = false, message = "La FechaAsistencia es obligatoria." });
        }

        if (request.IdEstado <= 0)
        {
            return BadRequest(new { success = false, message = "El IdEstado es obligatorio." });
        }

        try
        {
            var usuarioAccion =
                User.FindFirstValue("Usuario")
                ?? User.FindFirstValue("usuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.FindFirstValue("unique_name")
                ?? User.Identity?.Name
                ?? "SISTEMA";

            await _asistenciaReporteService.ActualizarEstadoMarcacionAsync(request, usuarioAccion, cancellationToken);
            return Ok(new { success = true, message = "Estado de marcacion actualizado correctamente." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpGet("tracking")]
    public async Task<IActionResult> ObtenerTrackingEmpleado(
        [FromQuery] AsistenciaTrackingConsultaRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "El IdEmpleado es obligatorio." });
        }

        if (string.IsNullOrWhiteSpace(request.FechaAsistencia))
        {
            return BadRequest(new { success = false, message = "La FechaAsistencia es obligatoria." });
        }

        try
        {
            var data = await _asistenciaReporteService.ObtenerTrackingEmpleadoAsync(request, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }
}
