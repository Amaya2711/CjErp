using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/asistencia/reporte")]
[Authorize]
public class AsistenciaReporteController : ControllerBase
{
    private readonly IAsistenciaReporteService _asistenciaReporteService;

    public AsistenciaReporteController(IAsistenciaReporteService asistenciaReporteService)
    {
        _asistenciaReporteService = asistenciaReporteService;
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
}
