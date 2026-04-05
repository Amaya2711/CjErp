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

    [HttpGet("usuario/{idUsuario}")]
    public async Task<IActionResult> ListarPorUsuario(string idUsuario)
    {
        if (string.IsNullOrWhiteSpace(idUsuario))
            return BadRequest(new { message = "El usuario es obligatorio." });

        var result = await _segMenuService.ListarPorUsuarioAsync(idUsuario);
        return Ok(result);
    }

    [HttpGet("rol/{idRol:int}/asignado")]
    public async Task<IActionResult> ListarAsignadoPorRol(int idRol)
    {
        var result = await _segMenuService.ListarAsignadoPorRolAsync(idRol);
        return Ok(result);
    }

    [HttpPost("rol/asignacion")]
    public async Task<IActionResult> GuardarAsignacionRol([FromBody] GuardarAsignacionMenuRolRequest request)
    {
        if (request is null)
            return BadRequest(new { message = "Datos inválidos." });

        if (request.IdRol <= 0)
            return BadRequest(new { message = "El rol es obligatorio." });

        var usuario = User?.Identity?.Name ?? "SISTEMA";

        await _segMenuService.GuardarAsignacionRolAsync(
            request.IdRol,
            request.MenuIds ?? new List<int>(),
            usuario
        );

        return Ok(new
        {
            message = "Asignación de menú guardada correctamente."
        });
    }
}
