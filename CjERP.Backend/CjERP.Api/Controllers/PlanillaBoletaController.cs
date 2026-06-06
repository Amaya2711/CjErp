using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/recursoshumanos/planillas")]
[Authorize]
public class PlanillaBoletaController : ControllerBase
{
    private readonly IPlanillaBoletaService _planillaBoletaService;
    private readonly ILogger<PlanillaBoletaController> _logger;

    public PlanillaBoletaController(
        IPlanillaBoletaService planillaBoletaService,
        ILogger<PlanillaBoletaController> logger)
    {
        _planillaBoletaService = planillaBoletaService;
        _logger = logger;
    }

    [HttpPost("validar-xml")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> ValidarXml(
        [FromForm] List<IFormFile> archivos,
        CancellationToken cancellationToken)
    {
        if (archivos is null || archivos.Count == 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar al menos un archivo XML." });
        }

        var data = await _planillaBoletaService.ValidarXmlMasivoAsync(
            await MapArchivosAsync(archivos, cancellationToken),
            ResolveUsuarioAccion(),
            cancellationToken);

        return Ok(new
        {
            success = true,
            message = "Validacion de XML completada.",
            data
        });
    }

    [HttpPost("importar-xml")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> ImportarXml(
        [FromForm] List<IFormFile> archivos,
        CancellationToken cancellationToken)
    {
        if (archivos is null || archivos.Count == 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar al menos un archivo XML." });
        }

        try
        {
            var data = await _planillaBoletaService.ImportarXmlMasivoAsync(
                await MapArchivosAsync(archivos, cancellationToken),
                ResolveUsuarioAccion(),
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Importacion de XML completada.",
                data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PlanillaBoletaController] Error no controlado durante la importacion masiva de XML.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error al importar los XML de planilla."
            });
        }
    }

    [HttpGet("/api/planilla-boleta/pdf/{idBoleta:int}")]
    public async Task<IActionResult> DescargarPdf(int idBoleta, CancellationToken cancellationToken)
    {
        try
        {
            var pdfBytes = await _planillaBoletaService.GenerarPdfBoletaAsync(idBoleta, cancellationToken);
            return File(pdfBytes, "application/pdf", $"Boleta_{idBoleta}.pdf");
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
    }

    [HttpGet("/api/planilla-boleta/pdf-base64/{idBoleta:int}")]
    public async Task<IActionResult> ObtenerPdfBase64(int idBoleta, CancellationToken cancellationToken)
    {
        try
        {
            var base64 = await _planillaBoletaService.ObtenerPdfBase64Async(idBoleta, cancellationToken);
            return Ok(new
            {
                success = true,
                message = "PDF Base64 obtenido correctamente.",
                data = new
                {
                    idBoleta,
                    nombreArchivo = $"Boleta_{idBoleta}.pdf",
                    base64
                }
            });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
    }

    [HttpGet("/api/planilla-boleta/pdf-masivo/{periodo}")]
    public async Task<IActionResult> DescargarPdfMasivo(string periodo, CancellationToken cancellationToken)
    {
        try
        {
            var zipBytes = await _planillaBoletaService.GenerarZipPeriodoAsync(periodo, cancellationToken);
            var zipName = $"Boletas_{periodo.Replace("-", string.Empty).Replace("/", string.Empty)}.zip";
            return File(zipBytes, "application/zip", zipName);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
    }

    [HttpGet("/api/planilla-boleta/firma-diagnostico/{idBoleta:int}")]
    public async Task<IActionResult> ObtenerDiagnosticoFirma(int idBoleta, CancellationToken cancellationToken)
    {
        try
        {
            var data = await _planillaBoletaService.ObtenerDiagnosticoFirmaAsync(idBoleta, cancellationToken);
            return Ok(new
            {
                success = true,
                message = "Diagnostico de firma obtenido correctamente.",
                data
            });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
    }

    private string ResolveUsuarioAccion()
    {
        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }

    private static async Task<List<PlanillaXmlArchivoDto>> MapArchivosAsync(
        IEnumerable<IFormFile> archivos,
        CancellationToken cancellationToken)
    {
        var result = new List<PlanillaXmlArchivoDto>();

        foreach (var archivo in archivos)
        {
            await using var stream = archivo.OpenReadStream();
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream, cancellationToken);

            result.Add(new PlanillaXmlArchivoDto
            {
                NombreArchivo = archivo.FileName ?? string.Empty,
                Contenido = memoryStream.ToArray(),
                TamanioBytes = archivo.Length
            });
        }

        return result;
    }
}
