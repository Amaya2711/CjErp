using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/admin/vacaciones")]
[Authorize]
public class VacacionesController : ControllerBase
{
    private readonly IVacacionesService _vacacionesService;

    public VacacionesController(IVacacionesService vacacionesService)
    {
        _vacacionesService = vacacionesService;
    }

    [HttpPost]
    public async Task<IActionResult> Grabar(
        [FromBody] VacacionesGrabarRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _vacacionesService.GrabarAsync(request, ResolveUsuarioAccion(), cancellationToken);

            var exito = result.Exito ?? result.Resultado ?? 1;
            if (exito != 1)
            {
                return BadRequest(new { success = false, message = result.Mensaje ?? "No se pudo registrar las vacaciones.", data = result });
            }

            return Ok(new
            {
                success = true,
                message = result.Mensaje ?? "Vacaciones registradas correctamente.",
                data = result
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.InnerException?.Message });
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
