using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/mantenimiento/migracion")]
[Authorize]
public sealed class MantenimientoMigracionController : ControllerBase
{
    private readonly IMigracionImportService _migracionImportService;

    public MantenimientoMigracionController(IMigracionImportService migracionImportService)
    {
        _migracionImportService = migracionImportService;
    }

    public sealed class AnalizarMigracionRequest
    {
        public IFormFile? Archivo { get; set; }

        public string? Modo { get; set; }
    }

    [HttpPost("analizar")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> Analizar(
        [FromForm] AnalizarMigracionRequest request,
        CancellationToken cancellationToken)
    {
        var archivo = request.Archivo;
        if (archivo is null || archivo.Length <= 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar un archivo Excel valido." });
        }

        if (!archivo.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { success = false, message = "Solo se permiten archivos .xlsx." });
        }

        try
        {
            await using var memoryStream = new MemoryStream();
            await archivo.CopyToAsync(memoryStream, cancellationToken);

            var data = await _migracionImportService.AnalizarAsync(
                memoryStream.ToArray(),
                archivo.FileName,
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Archivo analizado correctamente.",
                data
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost("aplicar")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> Aplicar(
        [FromForm] AnalizarMigracionRequest request,
        CancellationToken cancellationToken)
    {
        var archivo = request.Archivo;
        if (archivo is null || archivo.Length <= 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar un archivo Excel valido." });
        }

        if (!archivo.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { success = false, message = "Solo se permiten archivos .xlsx." });
        }

        if (!TryParseModo(request.Modo, out var modo))
        {
            return BadRequest(new { success = false, message = "Debe seleccionar un modo valido de migracion." });
        }

        try
        {
            await using var memoryStream = new MemoryStream();
            await archivo.CopyToAsync(memoryStream, cancellationToken);

            var data = await _migracionImportService.AplicarAsync(
                memoryStream.ToArray(),
                archivo.FileName,
                modo,
                cancellationToken);

            var message = modo == MigracionImportModo.Migrar
                ? "El store de INSERT se ejecuto correctamente."
                : "El store de UPDATE se ejecuto correctamente.";

            return Ok(new
            {
                success = true,
                message,
                data
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    private static bool TryParseModo(string? value, out MigracionImportModo modo)
    {
        modo = MigracionImportModo.Actualizar;

        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Trim().ToLowerInvariant() switch
        {
            "migrar" => (modo = MigracionImportModo.Migrar) == MigracionImportModo.Migrar,
            "actualizar" => (modo = MigracionImportModo.Actualizar) == MigracionImportModo.Actualizar,
            _ => false,
        };
    }
}
