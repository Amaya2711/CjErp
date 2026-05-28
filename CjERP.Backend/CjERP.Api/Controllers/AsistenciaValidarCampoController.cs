using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/operacion/aprobarcampo")]
[Authorize]
public class AsistenciaValidarCampoController : ControllerBase
{
    private readonly IAsistenciaValidarCampoService _asistenciaValidarCampoService;

    public AsistenciaValidarCampoController(IAsistenciaValidarCampoService asistenciaValidarCampoService)
    {
        _asistenciaValidarCampoService = asistenciaValidarCampoService;
    }

    [HttpGet("listar")]
    public async Task<IActionResult> Listar(
        [FromQuery] AsistenciaValidarCampoFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var data = await _asistenciaValidarCampoService.ListarAsync(filtro, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("detalle")]
    public async Task<IActionResult> Obtener(
        [FromQuery] AsistenciaValidarCampoClaveDto clave,
        CancellationToken cancellationToken)
    {
        var data = await _asistenciaValidarCampoService.ObtenerPorClaveAsync(clave, cancellationToken);
        if (data is null)
        {
            return NotFound(new { success = false, message = "No se encontró el registro solicitado." });
        }

        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost]
    public async Task<IActionResult> Crear(
        [FromBody] AsistenciaValidarCampoGuardarDto request,
        CancellationToken cancellationToken)
    {
        request.UsuarioAccion = ResolveUsuario(request.UsuarioAccion);
        var data = await _asistenciaValidarCampoService.CrearAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Registro creado correctamente.", data });
    }

    [HttpPut]
    public async Task<IActionResult> Actualizar(
        [FromBody] AsistenciaValidarCampoGuardarDto request,
        CancellationToken cancellationToken)
    {
        request.UsuarioAccion = ResolveUsuario(request.UsuarioAccion);
        var data = await _asistenciaValidarCampoService.ActualizarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Registro actualizado correctamente.", data });
    }

    [HttpPost("aprobar-ingreso")]
    public async Task<IActionResult> AprobarIngreso(
        [FromBody] AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken)
    {
        request.UsuarioAccion = ResolveUsuario(request.UsuarioAccion);
        request.IdAprobador ??= ResolveIdAprobador();
        if (request.IdAprobador is null or <= 0)
        {
            return BadRequest(new { success = false, message = "No se pudo resolver el aprobador actual." });
        }
        var data = await _asistenciaValidarCampoService.AprobarIngresoAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Ingreso aprobado correctamente.", data });
    }

    [HttpPost("aprobar-salida")]
    public async Task<IActionResult> AprobarSalida(
        [FromBody] AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken)
    {
        request.UsuarioAccion = ResolveUsuario(request.UsuarioAccion);
        request.IdAprobador ??= ResolveIdAprobador();
        if (request.IdAprobador is null or <= 0)
        {
            return BadRequest(new { success = false, message = "No se pudo resolver el aprobador actual." });
        }
        var data = await _asistenciaValidarCampoService.AprobarSalidaAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Salida aprobada correctamente.", data });
    }

    [HttpPost("rechazar")]
    public async Task<IActionResult> Rechazar(
        [FromBody] AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken)
    {
        request.UsuarioAccion = ResolveUsuario(request.UsuarioAccion);
        request.IdAprobador ??= ResolveIdAprobador();
        if (request.IdAprobador is null or <= 0)
        {
            return BadRequest(new { success = false, message = "No se pudo resolver el aprobador actual." });
        }
        var data = await _asistenciaValidarCampoService.RechazarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Registro rechazado correctamente.", data });
    }

    private int? ResolveIdAprobador()
    {
        var aprobadorClaim = User.FindFirstValue("IdEmpleado")
            ?? User.FindFirstValue("CodEmp")
            ?? User.FindFirstValue("CodEmpleadoMostrar");

        return int.TryParse(aprobadorClaim, out var idAprobador) && idAprobador > 0
            ? idAprobador
            : null;
    }

    private string ResolveUsuario(string? usuario)
    {
        if (!string.IsNullOrWhiteSpace(usuario))
        {
            return usuario.Trim();
        }

        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }
}
