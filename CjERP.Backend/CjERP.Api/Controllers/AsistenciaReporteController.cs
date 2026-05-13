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

        if (request.Items is null || request.Items.Count == 0)
        {
            return BadRequest(new { success = false, message = "No hay datos para exportar el PDF." });
        }

        var pdfBytes = await _asistenciaReporteService.GenerarPdfGerencialAsync(request, cancellationToken);
        var fileName = $"reporte_asistencia_{request.FechaInicio.Replace("/", string.Empty)}_{request.FechaFin.Replace("/", string.Empty)}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }
}
