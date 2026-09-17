using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController, Authorize, Route("api/tesoreria/pagos")]
public sealed class PagoTesoreriaController(PagoTesoreriaService service, ISegMenuService menus, ILogger<PagoTesoreriaController> logger, IHttpClientFactory httpClients) : ControllerBase
{
    private const string GestorArchivoUrl = "https://www.elnk.uno/cjmultimedia/mgr001.php";
    private async Task<bool> PuedeAsync()
    {
        var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrWhiteSpace(usuario)) return false;

        // Debe coincidir con la fuente usada para construir el menú lateral.
        // El SP dinámico antiguo puede no devolver páginas asignadas mediante
        // SegPerfilRolMenu, aun cuando el usuario las tiene visibles.
        var opciones = await menus.ListarPorUsuarioAsync(usuario);
        return opciones.Any(p =>
            string.Equals(p.Ruta?.Trim().TrimEnd('/'), "/finanzas/tesoreria/pagartesoreria", StringComparison.OrdinalIgnoreCase)
            || string.Equals(p.Ruta?.Trim().TrimEnd('/'), "/finanzas/tesoreria/pagartesoreria_v1", StringComparison.OrdinalIgnoreCase));
    }

    private ObjectResult SinAcceso() => StatusCode(403, new { message = "No tiene acceso a Pagos de tesorería. Asigne esta página al perfil y rol correspondiente en Seguridad / Menú." });

    [HttpGet("catalogos")]
    public async Task<IActionResult> Catalogos(CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name)!;
        return Ok(new { catalogos = await service.CatalogosAsync(ct), puedePagar = true,
            permisosRevision = await service.PermisosRevisionAsync(usuario, ct) });
    }

    [HttpGet("v1")]
    public async Task<IActionResult> ListarV1([FromQuery] int? idEstado = null, [FromQuery] DateTime? fechaInicio = null, [FromQuery] DateTime? fechaFin = null, CancellationToken ct = default)
    {
        if (!await PuedeAsync()) return SinAcceso();
        return Ok(await service.ListarConsultaIniAsync(idEstado, fechaInicio, fechaFin, ct));
    }

    [HttpPut("revision")]
    public async Task<IActionResult> GuardarRevision(PagoRevisionDto request, CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrWhiteSpace(usuario)) return Unauthorized();
        try
        {
            await service.GuardarRevisionAsync(request, usuario, ct);
            return Ok(new { procesados = 1 });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { message = ex.Message }); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Error editando recibo {Correlativo} en Revisión por {Usuario}", request.Item.Correlativo, usuario);
            return StatusCode(500, new { message = "No se pudo guardar el recibo. Actualice la consulta antes de reintentar." });
        }
    }

    [HttpGet("revision/{correlativo:int}/factura")]
    public async Task<IActionResult> DescargarFacturaRevision(int correlativo, CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        var codigo = (await service.ObtenerFacturaRevisionAsync(correlativo, ct))?.Trim();
        if (string.IsNullOrWhiteSpace(codigo)) return NotFound(new { message = "No hay factura adjunta para este recibo." });
        if (!codigo.All(char.IsDigit)) return BadRequest(new { message = "La factura usa una ruta de SharePoint y debe abrirse directamente." });

        try
        {
            using var client = httpClients.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(2);
            async Task<string> RecuperarAsync(string tipo) => LimpiarRespuesta(await client.GetStringAsync(
                $"{GestorArchivoUrl}?i={Uri.EscapeDataString(codigo)}&t={tipo}", ct));
            var nombre = await RecuperarAsync("nombre");
            var contenido = await RecuperarAsync("contenido");
            var bytes = Convert.FromBase64String(contenido);
            var nombreSeguro = Path.GetFileName(nombre);
            if (string.IsNullOrWhiteSpace(nombreSeguro)) nombreSeguro = $"factura-{correlativo}";
            // Sin nombre de descarga: el navegador puede mostrar PDF e imágenes en su visor nativo.
            return File(bytes, ObtenerTipoContenido(nombreSeguro));
        }
        catch (FormatException)
        {
            return StatusCode(502, new { message = "El gestor de archivos devolvió una factura inválida." });
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "No se pudo descargar la factura {Correlativo} desde el gestor antiguo", correlativo);
            return StatusCode(502, new { message = "No se pudo recuperar la factura desde el gestor de archivos." });
        }
    }

    private static string LimpiarRespuesta(string value) => value.Replace("\r", "").Replace("\n", "").Trim().Trim('"');

    private static string ObtenerTipoContenido(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        ".webp" => "image/webp",
        ".txt" => "text/plain",
        _ => "application/octet-stream",
    };

    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] int estado = 5, [FromQuery] DateTime? desde = null, [FromQuery] DateTime? hasta = null, [FromQuery] int? correlativo = null, CancellationToken ct = default)
    {
        if (!await PuedeAsync()) return SinAcceso();
        try { return Ok(await service.ListarAsync(estado, desde, hasta, correlativo, ct)); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("cuentas/{responsable:int}")]
    public async Task<IActionResult> Cuentas(int responsable, CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        return Ok(await service.CuentasAsync(responsable, ct));
    }

    [HttpPost]
    public async Task<IActionResult> Pagar(PagoTesoreriaRequestDto request, CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        var usuario = User.FindFirstValue("Usuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("IdUsuario");
        if (string.IsNullOrWhiteSpace(usuario)) return Unauthorized();
        try { return Ok(new { procesados = await service.PagarAsync(request, usuario, ct) }); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Error registrando pagos de tesorería por {Usuario}", usuario);
            return StatusCode(500, new { message = "No se pudo confirmar el pago. Actualice la lista antes de volver a intentarlo." });
        }
    }

    [HttpPost("grabar")]
    public async Task<IActionResult> Grabar(PagoTesoreriaGrabarDto request, CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        try { return Ok(new { procesados = await service.GrabarAsync(request, ct) }); }
        catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError(ex, "Error grabando datos de pago"); return StatusCode(500, new { message = "No se pudo grabar la información del pago." }); }
    }

    [HttpPost("acciones")]
    public async Task<IActionResult> Accion(PagoTesoreriaAccionDto request, CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        var usuario = User.FindFirstValue("Usuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("IdUsuario");
        if (string.IsNullOrWhiteSpace(usuario)) return Unauthorized();
        try { return Ok(new { procesados = await service.EjecutarAccionAsync(request, usuario, ct) }); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Error ejecutando {Accion} de tesorería por {Usuario}", request.Accion, usuario);
            return StatusCode(500, new { message = "No se pudo confirmar la operación. Actualice la lista antes de volver a intentarlo." });
        }
    }
}
