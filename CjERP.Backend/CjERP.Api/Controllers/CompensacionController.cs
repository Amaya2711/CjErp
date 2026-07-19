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

    [HttpGet("saldos")]
    public async Task<IActionResult> ListarSaldos(CancellationToken cancellationToken)
    {
        var data = await _compensacionService.ListarSaldosAsync(cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> ObtenerPorId(long id, CancellationToken cancellationToken)
    {
        var data = await _compensacionService.ObtenerPorIdAsync(id, cancellationToken);
        if (data is null)
        {
            return NotFound(new { success = false, message = "No se encontró la compensación solicitada." });
        }

        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("saldo")]
    public async Task<IActionResult> ObtenerSaldo(
        [FromQuery] int idEmpleadoCj,
        CancellationToken cancellationToken)
    {
        if (idEmpleadoCj <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleadoCj es obligatorio." });
        }

        var data = await _compensacionService.ObtenerSaldoAsync(idEmpleadoCj, cancellationToken);
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
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.InnerException?.Message });
        }
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Actualizar(
        long id,
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
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.InnerException?.Message });
        }
    }

    [HttpPost("procesar")]
    public async Task<IActionResult> Procesar(
        [FromBody] ProcesarCompensacionRequestDto request,
        CancellationToken cancellationToken)
    {
        var comentario = request.Comentario?.Trim();

        if (request.Accion == "RECHAZAR" && string.IsNullOrWhiteSpace(comentario))
        {
            return BadRequest(new
            {
                success = false,
                message = "Debe ingresar un comentario o motivo de rechazo antes de continuar."
            });
        }

        if (!string.IsNullOrEmpty(comentario) && comentario.Length > 500)
        {
            return BadRequest(new
            {
                success = false,
                message = "El comentario no puede superar los 500 caracteres."
            });
        }

        request.Comentario = comentario;

        try
        {
            var empleadoAccion = ResolveEmpleadoAccion(request);
            var result = await _compensacionService.ProcesarAsync(
                request,
                ResolveUsuarioAccion(),
                empleadoAccion,
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = result.Mensaje,
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

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Eliminar(long id, CancellationToken cancellationToken)
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

    private int? ResolveEmpleadoAccion(ProcesarCompensacionRequestDto? request = null)
    {
        if (request?.IdEmpleadoAccion is > 0)
        {
            return request.IdEmpleadoAccion;
        }

        var empleadoClaim = User.FindFirstValue("IdEmpleado")
            ?? User.FindFirstValue("idEmpleado")
            ?? User.FindFirstValue("IdEmpleadoCj")
            ?? User.FindFirstValue("idEmpleadoCj")
            ?? User.FindFirstValue("CodEmp")
            ?? User.FindFirstValue("codEmp")
            ?? User.FindFirstValue("CodEmpleadoMostrar")
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        return int.TryParse(empleadoClaim, out var empleadoId) && empleadoId > 0
            ? empleadoId
            : null;
    }
}
