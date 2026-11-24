using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/finanzas/cxc")]
[Authorize]
public sealed class FinanzasCxcController : ControllerBase
{
    private const string MensajeFaltaTabla =
        "Falta crear la tabla dbo.CxcDocumentos (ejecutar Database/Finanzas/08_Cxc_Documentos_Sire.sql).";

    private const string MensajeFaltaTablaDetracciones =
        "Falta crear la tabla dbo.CxcDetracciones (ejecutar Database/Finanzas/10_Cxc_Detracciones.sql) o dbo.CxcDocumentos (08_Cxc_Documentos_Sire.sql).";

    private readonly ICxcCargaService _service;
    private readonly ICxcDetraccionesService _detracciones;
    private readonly ILogger<FinanzasCxcController> _logger;

    public FinanzasCxcController(ICxcCargaService service, ICxcDetraccionesService detracciones, ILogger<FinanzasCxcController> logger)
    {
        _service = service;
        _detracciones = detracciones;
        _logger = logger;
    }

    [HttpPost("carga-sire")]
    [RequestSizeLimit(60_000_000)]
    public async Task<IActionResult> CargarSire([FromBody] CxcCargaSireRequestDto request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Contenido))
        {
            return BadRequest(new { success = false, message = "El archivo no puede venir vacio." });
        }

        try
        {
            var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "sistema";
            var data = await _service.CargarSireAsync(request, usuario, ct);
            return Ok(new { success = true, message = data.Mensaje, data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (SqlException ex) when (ex.Number == 208)
        {
            _logger.LogError(ex, "[FinanzasCxc] Falta la tabla dbo.CxcDocumentos.");
            return StatusCode(500, new { success = false, message = MensajeFaltaTabla });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasCxc] Error en carga SIRE.");
            return StatusCode(500, new { success = false, message = "Ocurrio un error al procesar el archivo." });
        }
    }

    [HttpPost("carga-detracciones")]
    [RequestSizeLimit(60_000_000)]
    public async Task<IActionResult> CargarDetracciones([FromBody] CxcCargaDetraccionesRequestDto request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Contenido))
        {
            return BadRequest(new { success = false, message = "El archivo no puede venir vacio." });
        }

        try
        {
            var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "sistema";
            var data = await _detracciones.CargarAsync(request, usuario, ct);
            return Ok(new { success = true, message = data.Mensaje, data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (SqlException ex) when (ex.Number == 208)
        {
            _logger.LogError(ex, "[FinanzasCxc] Falta una tabla de CxC.");
            return StatusCode(500, new { success = false, message = MensajeFaltaTablaDetracciones });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasCxc] Error en carga de detracciones.");
            return StatusCode(500, new { success = false, message = "Ocurrio un error al procesar el archivo." });
        }
    }

    [HttpGet("detracciones")]
    public async Task<IActionResult> Detracciones(CancellationToken ct)
    {
        try
        {
            var data = await _detracciones.ListarAsync(ct);
            return Ok(new { success = true, message = "Detracciones cargadas.", data });
        }
        catch (SqlException ex) when (ex.Number == 208)
        {
            return StatusCode(500, new { success = false, message = MensajeFaltaTablaDetracciones });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasCxc] Error al listar detracciones.");
            return StatusCode(500, new { success = false, message = "Ocurrio un error al listar las detracciones." });
        }
    }

    [HttpGet("documentos")]
    public async Task<IActionResult> Documentos([FromQuery] string? periodo, CancellationToken ct)
    {
        try
        {
            var data = await _service.ListarDocumentosAsync(periodo, ct);
            return Ok(new { success = true, message = "Documentos cargados.", data });
        }
        catch (SqlException ex) when (ex.Number == 208)
        {
            return StatusCode(500, new { success = false, message = MensajeFaltaTabla });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasCxc] Error al listar documentos.");
            return StatusCode(500, new { success = false, message = "Ocurrio un error al listar los documentos." });
        }
    }
}
