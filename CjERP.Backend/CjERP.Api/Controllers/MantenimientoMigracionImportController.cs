using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/mantenimiento/migracion/importar")]
[Authorize]
public sealed class MantenimientoMigracionImportController : ControllerBase
{
    private readonly IMigracionImportProcesarNewService _service;

    public MantenimientoMigracionImportController(IMigracionImportProcesarNewService service)
    {
        _service = service;
    }

    [HttpPost("procesar")]
    public async Task<IActionResult> Procesar(
        [FromBody] MigracionImportProcesarNewRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.Datos is null || request.Datos.Count == 0)
        {
            return BadRequest(new { success = false, message = "Debe cargar al menos un registro del Excel." });
        }

        try
        {
            var resultado = await _service.ProcesarAsync(request.Datos, request.Accion, cancellationToken);

            var mensaje = string.Equals(resultado.Resumen.Accion, "ACTUALIZAR", StringComparison.OrdinalIgnoreCase)
                ? "El store de ACTUALIZAR se ejecuto correctamente."
                : "El store de VALIDAR se ejecuto correctamente.";

            return Ok(new
            {
                success = true,
                message = mensaje,
                data = resultado
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error interno al procesar la solicitud.",
                detail = ex.Message,
                exceptionType = ex.GetType().FullName
            });
        }
    }
}
