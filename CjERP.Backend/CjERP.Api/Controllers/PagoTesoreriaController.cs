using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController, Authorize, Route("api/tesoreria/pagos")]
public sealed class PagoTesoreriaController(PagoTesoreriaService service, ISegMenuService menus, ILogger<PagoTesoreriaController> logger) : ControllerBase
{
    private async Task<bool> PuedeAsync()
    {
        var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrWhiteSpace(usuario) || !int.TryParse(User.FindFirstValue("IdRol"), out var rol) ||
            !int.TryParse(User.FindFirstValue("IdPerfil"), out var perfil)) return false;
        var opciones = await menus.ListarMenuDinamicoAsync(usuario, perfil, rol);
        return opciones.Any(p => p.Acceso == 1 &&
            string.Equals(p.Ruta?.Trim().TrimEnd('/'), "/finanzas/tesoreria/pagartesoreria", StringComparison.OrdinalIgnoreCase));
    }

    private ObjectResult SinAcceso() => StatusCode(403, new { message = "No tiene acceso a Pagos de tesorería. Asigne esta página al perfil y rol correspondiente en Seguridad / Menú." });

    [HttpGet("catalogos")]
    public async Task<IActionResult> Catalogos(CancellationToken ct)
    {
        if (!await PuedeAsync()) return SinAcceso();
        return Ok(new { catalogos = await service.CatalogosAsync(ct), puedePagar = true });
    }

    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] int estado = 5, [FromQuery] DateTime? desde = null, [FromQuery] DateTime? hasta = null, CancellationToken ct = default)
    {
        if (!await PuedeAsync()) return SinAcceso();
        try { return Ok(await service.ListarAsync(estado, desde, hasta, ct)); }
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
