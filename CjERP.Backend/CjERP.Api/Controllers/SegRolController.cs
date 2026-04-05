using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/roles")]
[Authorize]
public class SegRolController : ControllerBase
{
    private readonly ISegRolService _segRolService;

    public SegRolController(ISegRolService segRolService)
    {
        _segRolService = segRolService;
    }

    [HttpGet]
    public async Task<IActionResult> Listar()
    {
        var result = await _segRolService.ListarAsync();
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> ObtenerPorId(int id)
    {
        var result = await _segRolService.ObtenerPorIdAsync(id);

        if (result is null)
            return NotFound(new { message = "Rol no encontrado." });

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] CrearRolRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombreRol))
            return BadRequest(new { message = "El nombre del rol es obligatorio." });

        if (string.IsNullOrWhiteSpace(request.Descripcion))
            return BadRequest(new { message = "La descripción es obligatoria." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        var id = await _segRolService.CrearAsync(request, usuario);

        return Ok(new
        {
            message = "Rol creado correctamente.",
            idRol = id
        });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarRolRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.NombreRol))
            return BadRequest(new { message = "El nombre del rol es obligatorio." });

        if (string.IsNullOrWhiteSpace(request.Descripcion))
            return BadRequest(new { message = "La descripción es obligatoria." });

        var existente = await _segRolService.ObtenerPorIdAsync(id);
        if (existente is null)
            return NotFound(new { message = "Rol no encontrado." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        var idActualizado = await _segRolService.ActualizarAsync(id, request, usuario);

        return Ok(new
        {
            message = "Rol actualizado correctamente.",
            idRol = idActualizado
        });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id)
    {
        var existente = await _segRolService.ObtenerPorIdAsync(id);
        if (existente is null)
            return NotFound(new { message = "Rol no encontrado." });

        var idEliminado = await _segRolService.EliminarAsync(id);

        return Ok(new
        {
            message = "Rol eliminado correctamente.",
            idRol = idEliminado
        });
    }
}
