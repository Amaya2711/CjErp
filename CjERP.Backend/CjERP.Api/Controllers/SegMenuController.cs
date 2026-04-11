using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/menu")]
[Authorize]
public class SegMenuController : ControllerBase
{
    private readonly ISegMenuService _segMenuService;

    public SegMenuController(ISegMenuService segMenuService)
    {
        _segMenuService = segMenuService;
    }

    [HttpGet("completo")]
    public async Task<IActionResult> ListarCompleto()
    {
        var result = await _segMenuService.ListarCompletoAsync();
        return Ok(result);
    }

    [HttpGet("dinamico-total")]
    public async Task<IActionResult> ListarDinamicoTotal()
    {
        var result = await _segMenuService.ListarDinamicoTotalAsync();
        return Ok(result);
    }

    [HttpGet("perfil/{idPerfil:int}/dinamico")]
    public async Task<IActionResult> ListarDinamicoPorPerfil(int idPerfil)
    {
        var result = await _segMenuService.ListarDinamicoPorPerfilAsync(idPerfil);
        return Ok(result);
    }

    [HttpGet("usuario/{idUsuario}")]
    public async Task<IActionResult> ListarPorUsuario(string idUsuario)
    {
        if (string.IsNullOrWhiteSpace(idUsuario))
            return BadRequest(new { message = "El usuario es obligatorio." });

        var result = await _segMenuService.ListarPorUsuarioAsync(idUsuario);
        return Ok(result);
    }

    [HttpPost("principal")]
    public async Task<IActionResult> CrearMenuPrincipal([FromBody] CrearMenuPrincipalRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombreMenu))
            return BadRequest(new { message = "El nombre del menú es obligatorio." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        var id = await _segMenuService.CrearMenuPrincipalAsync(request, usuario);

        return Ok(new
        {
            message = "Nodo principal creado correctamente.",
            idMenu = id
        });
    }

    [HttpGet("perfil/{idPerfil:int}/rol/{idRol:int}/asignado")]
    public async Task<IActionResult> ListarAsignadoPorPerfilRol(int idPerfil, int idRol)
    {
        if (idPerfil <= 0)
            return BadRequest(new { message = "El perfil es obligatorio." });

        if (idRol <= 0)
            return BadRequest(new { message = "El rol es obligatorio." });

        var result = await _segMenuService.ListarAsignadoPorPerfilRolAsync(idPerfil, idRol);
        return Ok(result);
    }

    [HttpPost("rol/asignacion")]
    public async Task<IActionResult> GuardarAsignacionRol([FromBody] GuardarAsignacionMenuRolRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (request.IdPerfil <= 0)
            return BadRequest(new { message = "El perfil es obligatorio." });

        if (request.IdRol <= 0)
            return BadRequest(new { message = "El rol es obligatorio." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        await _segMenuService.GuardarAsignacionPerfilRolAsync(
            request.IdPerfil,
            request.IdRol,
            request.MenuIds ?? new List<int>(),
            usuario
        );

        return Ok(new
        {
            message = "Asignación de menú guardada correctamente."
        });
    }

    [HttpPost("perfil-usuario/sincronizar")]
    public async Task<IActionResult> SincronizarPerfilUsuario([FromBody] SincronizarPerfilUsuarioRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (request.IdPerfil <= 0)
            return BadRequest(new { message = "El perfil es obligatorio." });

        if (string.IsNullOrWhiteSpace(request.IdUsuario))
            return BadRequest(new { message = "El usuario es obligatorio." });

        var total = await _segMenuService.SincronizarPerfilUsuarioAsync(
            request.IdPerfil,
            request.IdUsuario.Trim()
        );

        return Ok(new
        {
            message = "Sincronización ejecutada correctamente.",
            filasProcesadas = total
        });
    }
}
