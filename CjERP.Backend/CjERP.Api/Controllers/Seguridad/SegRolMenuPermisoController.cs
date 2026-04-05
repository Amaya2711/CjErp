using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers.Seguridad;

[ApiController]
[Route("api/seguridad-permisos")]
public class SegRolMenuPermisoController : ControllerBase
{
    private readonly ISegRolMenuPermisoService _service;

    public SegRolMenuPermisoController(ISegRolMenuPermisoService service)
    {
        _service = service;
    }

    [HttpGet("rol/{idRol:int}")]
    public async Task<IActionResult> ListarPorRol(int idRol)
    {
        var result = await _service.ListarPorRolAsync(idRol);
        return Ok(result);
    }

    [HttpGet("rol/{idRol:int}/menu/{idMenu:int}")]
    public async Task<IActionResult> Obtener(int idRol, int idMenu)
    {
        var result = await _service.ObtenerAsync(idRol, idMenu);

        if (result is null)
            return NotFound(new { message = "No se encontró el permiso solicitado." });

        return Ok(result);
    }

    [HttpPost("guardar")]
    public async Task<IActionResult> Guardar([FromBody] GuardarSegRolMenuPermisoDto dto)
    {
        if (dto.IdRol <= 0)
            return BadRequest(new { message = "IdRol es obligatorio." });

        if (dto.IdMenu <= 0)
            return BadRequest(new { message = "IdMenu es obligatorio." });

        if (string.IsNullOrWhiteSpace(dto.Usuario))
            dto.Usuario = "SYSTEM";

        await _service.GuardarAsync(dto);

        return Ok(new { message = "Permiso guardado correctamente." });
    }
}
