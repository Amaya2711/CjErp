using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/finanzas/conciliacion")]
[Authorize]
public sealed class FinanzasConciliacionController : ControllerBase
{
    private readonly IConciliacionBcpService _conciliacionBcpService;
    private readonly ILogger<FinanzasConciliacionController> _logger;

    public FinanzasConciliacionController(
        IConciliacionBcpService conciliacionBcpService,
        ILogger<FinanzasConciliacionController> logger)
    {
        _conciliacionBcpService = conciliacionBcpService;
        _logger = logger;
    }

    [HttpPost("analizar")]
    public async Task<IActionResult> Analizar(
        [FromBody] ConciliacionBcpAnalizarRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { success = false, message = "La solicitud no puede venir vacia." });
        }

        try
        {
            var usuario = ResolveUsuarioAccion();
            var response = await _conciliacionBcpService.AnalizarAsync(request, usuario, cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Analisis de conciliacion completado.",
                data = response
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "[FinanzasConciliacionController] No se pudo completar el analisis IA de conciliacion.");
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
    }

    [HttpPost("insertar")]
    public async Task<IActionResult> Insertar(
        [FromBody] ConciliacionBcpInsertRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { success = false, message = "La solicitud no puede venir vacia." });
        }

        try
        {
            var usuario = ResolveUsuarioAccion();
            var response = await _conciliacionBcpService.InsertarAsync(request, usuario, cancellationToken);

            if (response.Errores.Count > 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = string.Join(" ", response.Errores),
                    data = response
                });
            }

            return Ok(new
            {
                success = true,
                message = $"Se insertaron {response.FilasInsertadas} fila(s) correctamente.",
                data = response
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error no controlado al insertar movimientos BCP.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error al insertar la conciliacion BCP."
            });
        }
    }

    [HttpPost("exportar-analisis")]
    public async Task<IActionResult> ExportarAnalisis(
        [FromBody] ConciliacionBcpExportRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { success = false, message = "La solicitud no puede venir vacia." });
        }

        try
        {
            var usuario = ResolveUsuarioAccion();
            var response = await _conciliacionBcpService.ExportarAnalisisAsync(request, usuario, cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Exportacion de conciliacion preparada correctamente.",
                data = response
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "[FinanzasConciliacionController] No se pudo preparar la exportacion IA de conciliacion.");
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
    }

    [HttpPost("conciliar-planilla")]
    public async Task<IActionResult> ConciliarPlanilla(
        [FromBody] ConciliacionBcpConciliarPlanillaRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { success = false, message = "La solicitud no puede venir vacia." });
        }

        if (!request.IdCargo.HasValue || !request.IdEmpleado.HasValue || string.IsNullOrWhiteSpace(request.Estados))
        {
            return BadRequest(new
            {
                success = false,
                message = "IdCargo, IdEmpleado y Estados son obligatorios para ejecutar la conciliacion."
            });
        }

        try
        {
            var usuario = ResolveUsuarioAccion();
            var response = await _conciliacionBcpService.ConciliarPlanillaAsync(request, usuario, cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Conciliacion ejecutada correctamente.",
                data = response
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "[FinanzasConciliacionController] No se pudo ejecutar la conciliacion MovimientosBcp vs Planilla.");
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error SQL al conciliar movimientos BCP con planilla.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error SQL al ejecutar la conciliacion con planilla.",
                detail = ex.Message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error no controlado al conciliar movimientos BCP con planilla.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error al ejecutar la conciliacion con planilla.",
                detail = ex.Message
            });
        }
    }

    [HttpPut("movimientos/{idMovimientoBanco:int}/comentario")]
    public async Task<IActionResult> ActualizarComentarioMovimiento(
        int idMovimientoBanco,
        [FromBody] ConciliacionBcpActualizarComentarioRequestDto request,
        CancellationToken cancellationToken)
    {
        if (idMovimientoBanco <= 0)
        {
            return BadRequest(new
            {
                success = false,
                message = "El IdMovimientoBanco es invalido."
            });
        }

        if (request is null)
        {
            return BadRequest(new
            {
                success = false,
                message = "La solicitud no puede venir vacia."
            });
        }

        try
        {
            var usuario = ResolveUsuarioAccion();
            var response = await _conciliacionBcpService.ActualizarComentarioMovimientoAsync(
                idMovimientoBanco,
                request,
                usuario,
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Comentario actualizado correctamente.",
                data = response
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "[FinanzasConciliacionController] No se pudo actualizar el comentario del movimiento BCP.");
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error SQL al actualizar el comentario del movimiento BCP.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error SQL al actualizar el comentario del movimiento.",
                detail = ex.Message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error no controlado al actualizar el comentario del movimiento BCP.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error al actualizar el comentario del movimiento.",
                detail = ex.Message
            });
        }
    }

    [HttpGet("clasificacion/combos")]
    public async Task<IActionResult> ObtenerCombosClasificacion(CancellationToken cancellationToken)
    {
        try
        {
            var response = await _conciliacionBcpService.ObtenerCombosClasificacionAsync(cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Combos de clasificacion cargados correctamente.",
                data = response
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error al cargar combos de clasificacion contable.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error al cargar los combos de clasificacion."
            });
        }
    }

    [HttpPut("movimientos/clasificacion")]
    public async Task<IActionResult> ActualizarClasificacionContable(
        [FromBody] ConciliacionBcpActualizarClasificacionRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new
            {
                success = false,
                message = "La solicitud no puede venir vacia."
            });
        }

        try
        {
            var usuario = ResolveUsuarioAccion();
            var response = await _conciliacionBcpService.ActualizarClasificacionContableAsync(request, usuario, cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Clasificacion contable actualizada correctamente.",
                data = response
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "[FinanzasConciliacionController] No se pudo actualizar la clasificacion contable del movimiento BCP.");
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error SQL al actualizar la clasificacion contable del movimiento BCP.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error SQL al actualizar la clasificacion contable.",
                detail = ex.Message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FinanzasConciliacionController] Error no controlado al actualizar la clasificacion contable del movimiento BCP.");
            return StatusCode(500, new
            {
                success = false,
                message = "Ocurrio un error al actualizar la clasificacion contable.",
                detail = ex.Message
            });
        }
    }

    private string ResolveUsuarioAccion()
    {
        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }
}
