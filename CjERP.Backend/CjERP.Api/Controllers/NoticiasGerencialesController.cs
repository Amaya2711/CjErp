using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/inicio/noticias")]
[Authorize]
public class NoticiasGerencialesController : ControllerBase
{
    private readonly INoticiasGerencialesService _noticiasService;

    public NoticiasGerencialesController(INoticiasGerencialesService noticiasService)
    {
        _noticiasService = noticiasService;
    }

    [HttpGet("gerencial")]
    public async Task<IActionResult> Obtener([FromQuery] bool actualizar, CancellationToken cancellationToken)
    {
        try
        {
            var data = await _noticiasService.ObtenerAsync(actualizar, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            return BadRequest(new { success = false, message = "No se pudo generar el reporte de noticias." });
        }
    }
}
