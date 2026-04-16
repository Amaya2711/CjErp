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

    /// <summary>
    /// Crea la relación usuario-perfil si no existe.
    /// </summary>
    /// <param name="request">Objeto con idUsuario e idPerfil</param>
    /// <returns>Json con mensaje y/o id generado</returns>
    [HttpPost("usuario-perfil")]
    public async Task<IActionResult> GuardarUsuarioPerfil([FromBody] GuardarUsuarioPerfilRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.IdUsuario) || request.IdPerfil <= 0)
            return BadRequest(new { message = "Datos inválidos." });

        var existe = await _segMenuService.ExisteUsuarioPerfilAsync(request.IdUsuario, request.IdPerfil);
        if (existe)
            return Ok(new { message = "La relación usuario-perfil ya existe." });

        await _segMenuService.GuardarUsuarioPerfilAsync(
            request.IdUsuario.Trim(),
            request.IdPerfil,
            User?.Identity?.Name ?? "SISTEMA"
        );

        return Ok(new { message = "Relación usuario-perfil creada correctamente." });
    }

    /// <summary>
    /// Verifica si existe una relación activa usuario-perfil.
    /// </summary>
    /// <param name="idUsuario">ID del usuario</param>
    /// <param name="idPerfil">ID del perfil</param>
    /// <returns>Json { existe: true/false }</returns>
    [HttpGet("usuario-perfil/existe")]
    public async Task<IActionResult> ExisteUsuarioPerfil([FromQuery] string idUsuario, [FromQuery] int idPerfil)
    {
        if (string.IsNullOrWhiteSpace(idUsuario) || idPerfil <= 0)
            return BadRequest(new { message = "Parámetros inválidos." });

        var existe = await _segMenuService.ExisteUsuarioPerfilAsync(idUsuario.Trim(), idPerfil);
        return Ok(new { existe });
    }

    [HttpGet("completo")]
    public async Task<IActionResult> ListarCompleto()
    {
        var result = await _segMenuService.ListarCompletoAsync();
        return Ok(result);
    }

    [HttpGet("dinamico")]
    public async Task<IActionResult> ListarMenuDinamico(
        [FromQuery] string? idUsuario,
        [FromQuery] int? idPerfil,
        [FromQuery] int? idRol)
    {
        var result = await _segMenuService.ListarMenuDinamicoAsync(idUsuario, idPerfil, idRol);
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
        if (idPerfil <= 0)
            return BadRequest(new { message = "El perfil es obligatorio." });

        var result = await _segMenuService.ListarDinamicoPorPerfilAsync(idPerfil);
        return Ok(result);
    }

    [HttpGet("usuario/{idUsuario}")]
    public async Task<IActionResult> ListarPorUsuario(string idUsuario)
    {
        if (string.IsNullOrWhiteSpace(idUsuario))
            return BadRequest(new { message = "El usuario es obligatorio." });

        var result = await _segMenuService.ListarPorUsuarioAsync(idUsuario.Trim());
        return Ok(result);
    }

    [HttpPost("principal")]
    public async Task<IActionResult> CrearMenuPrincipal([FromBody] CrearMenuPrincipalRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombreMenu))
            return BadRequest(new { message = "El nombre del menú es obligatorio." });

        request.IdMenuPadre = null;

        var usuario = User?.Identity?.Name ?? "SISTEMA";
        var id = await _segMenuService.CrearMenuAsync(request, usuario);

        return Ok(new
        {
            message = "Nodo principal creado correctamente.",
            idMenu = id
        });
    }

    [HttpPost("nodo")]
    public async Task<IActionResult> CrearNodo([FromBody] CrearMenuPrincipalRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombreMenu))
            return BadRequest(new { message = "El nombre del menú es obligatorio." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";
        var id = await _segMenuService.CrearMenuAsync(request, usuario);

        return Ok(new
        {
            message = "Nodo creado correctamente.",
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
            request.Menus ?? new List<MenuAsignadoDto>(),
            usuario
        );

        return Ok(new
        {
            message = "Asignación de menú guardada correctamente."
        });
    }

    [HttpPost("usuario-perfil-rol")]
    public async Task<IActionResult> GuardarUsuarioPerfilRol([FromBody] GuardarUsuarioPerfilRolRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.IdUsuario))
            return BadRequest(new { message = "El usuario es obligatorio." });

        if (request.IdPerfil <= 0)
            return BadRequest(new { message = "El perfil es obligatorio." });

        if (request.IdRol <= 0)
            return BadRequest(new { message = "El rol es obligatorio." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        try
        {
            await _segMenuService.GuardarUsuarioPerfilRolAsync(
                request.IdUsuario.Trim(),
                request.IdPerfil,
                request.IdRol,
                usuario
            );

            return Ok(new
            {
                message = "Relación usuario-perfil-rol guardada correctamente."
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                message = "Error inesperado al guardar la relación usuario-perfil-rol.",
                detail = ex.Message
            });
        }
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