using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
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
    private readonly ILogger<AsistenciaReporteController> _logger;

    public AsistenciaReporteController(
        IAsistenciaReporteService asistenciaReporteService,
        ILogger<AsistenciaReporteController> logger)
    {
        _asistenciaReporteService = asistenciaReporteService;
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

        try
        {
            var pdfBytes = await _asistenciaReporteService.GenerarPdfEmpleadoLlamadaAtencionAsync(request, cancellationToken);
            var fileName = $"llamada_atencion_asistencia_{request.FechaInicio.Replace("/", string.Empty)}_{request.FechaFin.Replace("/", string.Empty)}.pdf";
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
}
