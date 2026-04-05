using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/perfiles")]
[Authorize]
public class SegPerfilController : ControllerBase
{
    private readonly ISegPerfilService _segPerfilService;

    public SegPerfilController(ISegPerfilService segPerfilService)
    {
        _segPerfilService = segPerfilService;
    }

    [HttpGet]
    public async Task<IActionResult> Listar()
    {
        var result = await _segPerfilService.ListarAsync();
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> ObtenerPorId(int id)
    {
        var result = await _segPerfilService.ObtenerPorIdAsync(id);

        if (result is null)
            return NotFound(new { message = "Perfil no encontrado." });

        return Ok(result);
    }

    [HttpGet("{id:int}/roles")]
    public async Task<IActionResult> ListarRolesPorPerfil(int id)
    {
        var result = await _segPerfilService.ListarRolesPorPerfilAsync(id);
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] CrearPerfilRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombrePerfil))
            return BadRequest(new { message = "El nombre del perfil es obligatorio." });

        if (string.IsNullOrWhiteSpace(request.Descripcion))
            return BadRequest(new { message = "La descripción es obligatoria." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        var id = await _segPerfilService.CrearAsync(request, usuario);

        return Ok(new
        {
            message = "Perfil creado correctamente.",
            idPerfil = id
        });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarPerfilRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombrePerfil))
            return BadRequest(new { message = "El nombre del perfil es obligatorio." });

        if (string.IsNullOrWhiteSpace(request.Descripcion))
            return BadRequest(new { message = "La descripción es obligatoria." });

        var existente = await _segPerfilService.ObtenerPorIdAsync(id);
        if (existente is null)
            return NotFound(new { message = "Perfil no encontrado." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        var idActualizado = await _segPerfilService.ActualizarAsync(id, request, usuario);

        return Ok(new
        {
            message = "Perfil actualizado correctamente.",
            idPerfil = idActualizado
        });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id)
    {
        var existente = await _segPerfilService.ObtenerPorIdAsync(id);
        if (existente is null)
            return NotFound(new { message = "Perfil no encontrado." });

        var idEliminado = await _segPerfilService.EliminarAsync(id);

        return Ok(new
        {
            message = "Perfil eliminado correctamente.",
            idPerfil = idEliminado
        });
    }
}