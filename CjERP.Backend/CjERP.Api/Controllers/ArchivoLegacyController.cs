using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

/// <summary>Descarga global de archivos/imágenes guardados en el gestor del sistema antiguo.</summary>
[ApiController, Authorize, Route("api/archivos/legacy")]
public sealed class ArchivoLegacyController(IGestorArchivoLegacyService gestor, ILogger<ArchivoLegacyController> logger) : ControllerBase
{
    [HttpGet("{codigo}")]
    public async Task<IActionResult> Descargar(string codigo, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(codigo) || !codigo.Trim().All(char.IsDigit))
            return BadRequest(new { success = false, message = "Código de archivo inválido (debe ser numérico)." });

        try
        {
            var archivo = await gestor.DescargarAsync(codigo, ct);
            if (archivo is null)
                return NotFound(new { success = false, message = "El gestor antiguo no tiene contenido para ese código." });

            // Sin nombre de descarga: el navegador puede mostrar PDF e imágenes en su visor nativo.
            Response.Headers["X-Archivo-Nombre"] = Uri.EscapeDataString(archivo.Nombre);
            Response.Headers["Access-Control-Expose-Headers"] = "X-Archivo-Nombre";
            return File(archivo.Contenido, archivo.ContentType);
        }
        catch (FormatException)
        {
            return StatusCode(502, new { success = false, message = "El gestor antiguo devolvió un archivo inválido." });
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "No se pudo descargar el archivo legacy {Codigo}", codigo);
            return StatusCode(502, new { success = false, message = "No se pudo recuperar el archivo desde el gestor antiguo." });
        }
    }
}
