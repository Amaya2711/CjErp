using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers.Seguridad;

[ApiController]
[Route("api/seguridad-permisos-acciones")]
[Authorize]
public class SegPermisosAccionesController : ControllerBase
{
    private readonly ISegPermisoAccionService _service;

    public SegPermisosAccionesController(ISegPermisoAccionService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> Listar(
        [FromQuery] string? rutaPagina,
        [FromQuery] int? idRol,
        [FromQuery] int? idEmpleado,
        [FromQuery] string? tipoElemento)
    {
        var result = await _service.ListarAsync(rutaPagina, idRol, idEmpleado, tipoElemento);
        return Ok(result);
    }

    [HttpGet("{idPermisoAccion:int}")]
    public async Task<IActionResult> Obtener(int idPermisoAccion)
    {
        if (idPermisoAccion <= 0)
        {
            return BadRequest(new { message = "El identificador es obligatorio." });
        }

        var result = await _service.ObtenerAsync(idPermisoAccion);
        if (result is null)
        {
            return NotFound(new { message = "No se encontró el permiso solicitado." });
        }

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Guardar([FromBody] GuardarPermisoAccionRequestDto request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (string.IsNullOrWhiteSpace(request.RutaPagina))
            return BadRequest(new { message = "La página es obligatoria." });

        if (string.IsNullOrWhiteSpace(request.ClaveAccion))
            return BadRequest(new { message = "La clave de acción es obligatoria." });

        if (string.IsNullOrWhiteSpace(request.TipoElemento))
            return BadRequest(new { message = "El tipo de elemento es obligatorio." });

        if ((request.IdRol is null or <= 0) && (request.IdEmpleado is null or <= 0))
            return BadRequest(new { message = "Debe seleccionar un rol o un empleado." });

        var usuario = User?.Identity?.Name ?? "SYSTEM";
        var id = await _service.GuardarAsync(request, usuario);

        return Ok(new
        {
            message = "Permiso guardado correctamente.",
            idPermisoAccion = id
        });
    }

    [HttpPut("{idPermisoAccion:int}")]
    public async Task<IActionResult> Actualizar(int idPermisoAccion, [FromBody] GuardarPermisoAccionRequestDto request)
    {
        if (idPermisoAccion <= 0)
            return BadRequest(new { message = "El identificador es obligatorio." });

        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        request.IdPermisoAccion = idPermisoAccion;
        return await Guardar(request);
    }

    [HttpDelete("{idPermisoAccion:int}")]
    public async Task<IActionResult> Eliminar(int idPermisoAccion)
    {
        if (idPermisoAccion <= 0)
            return BadRequest(new { message = "El identificador es obligatorio." });

        var id = await _service.EliminarAsync(idPermisoAccion);
        return Ok(new
        {
            message = "Permiso eliminado correctamente.",
            idPermisoAccion = id
        });
    }
}
