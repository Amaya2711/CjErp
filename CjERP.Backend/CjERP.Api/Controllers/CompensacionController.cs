using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/admin/compensacion")]
[Authorize]
public class CompensacionController : ControllerBase
{
    private readonly ICompensacionService _compensacionService;

    public CompensacionController(ICompensacionService compensacionService)
    {
        _compensacionService = compensacionService;
    }

    [HttpGet]
    public async Task<IActionResult> Listar(
        [FromQuery] CompensacionFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var data = await _compensacionService.ListarAsync(filtro, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost]
    public async Task<IActionResult> Crear(
        [FromBody] CompensacionUpsertDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var id = await _compensacionService.CrearAsync(request, ResolveUsuarioAccion(), cancellationToken);
            return Ok(new
            {
                success = true,
                message = "Compensación creada correctamente.",
                data = new { idEmpleadoCompensacion = id }
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Actualizar(
        int id,
        [FromBody] CompensacionUpsertDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            await _compensacionService.ActualizarAsync(id, request, ResolveUsuarioAccion(), cancellationToken);
            return Ok(new { success = true, message = "Compensación actualizada correctamente." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken cancellationToken)
    {
        try
        {
            await _compensacionService.EliminarAsync(id, ResolveUsuarioAccion(), cancellationToken);
            return Ok(new { success = true, message = "Compensación eliminada correctamente." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    private string ResolveUsuarioAccion()
    {
        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue("Usuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }
}
