using System.Collections.Generic;
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
    private readonly IPlanillaConsultaService _planillaConsultaService;

    public VacacionesController(
        IVacacionesService vacacionesService,
        IPlanillaConsultaService planillaConsultaService)
    {
        _vacacionesService = vacacionesService;
        _planillaConsultaService = planillaConsultaService;
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
                var mensaje =
                    !string.IsNullOrWhiteSpace(result.Mensaje)
                        ? result.Mensaje
                        : exito == 0
                            ? $"No se ingresaron fechas solicitadas para el rango {request.FechaInicio:dd/MM/yyyy} al {request.FechaFin:dd/MM/yyyy}. Verificar si ya existen."
                            : "No se pudo registrar las vacaciones.";

                return BadRequest(new
                {
                    success = false,
                    message = mensaje,
                    data = result
                });
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

    [HttpPost("rechazar")]
    public async Task<IActionResult> Rechazar(
        [FromBody] VacacionesRechazarRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _vacacionesService.RechazarAsync(request, ResolveUsuarioAccion(), cancellationToken);

            var exito = result.Exito ?? result.Resultado ?? 1;
            if (exito != 1)
            {
                return BadRequest(new
                {
                    success = false,
                    message = result.Mensaje ?? "No se pudo rechazar las vacaciones.",
                    data = result
                });
            }

            return Ok(new
            {
                success = true,
                message = result.Mensaje ?? "Vacaciones rechazadas correctamente.",
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

    [HttpPost("aprobar")]
    public async Task<IActionResult> Aprobar(
        [FromBody] VacacionesAprobarRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var idUsuarioAprueba = ResolveIdUsuarioAprueba();
            var result = await _vacacionesService.AprobarAsync(
                request,
                ResolveUsuarioAccion(),
                idUsuarioAprueba,
                cancellationToken);

            var exito = result.Exito ?? result.Resultado ?? 1;
            if (exito != 1)
            {
                return BadRequest(new
                {
                    success = false,
                    message = result.Mensaje ?? "No se pudo actualizar las vacaciones.",
                    data = result
                });
            }

            return Ok(new
            {
                success = true,
                message = result.Mensaje ?? "Vacaciones actualizadas correctamente.",
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

    [HttpGet("listar")]
    public async Task<IActionResult> Listar(
        [FromQuery] int? idEstado,
        [FromQuery] string? fechaInicio,
        [FromQuery] string? fechaFin,
        [FromQuery] string? nombreEmpleado,
        [FromQuery] int? maxRows,
        CancellationToken cancellationToken)
    {
        try
        {
            var parametros = new List<PlanillaConsultaParametroDto>();

            if (idEstado.HasValue)
            {
                parametros.Add(new PlanillaConsultaParametroDto
                {
                    Nombre = "IdEstado",
                    Valor = idEstado.Value.ToString(),
                    Tipo = "int"
                });
            }

            if (!string.IsNullOrWhiteSpace(fechaInicio))
            {
                parametros.Add(new PlanillaConsultaParametroDto
                {
                    Nombre = "FechaInicial",
                    Valor = fechaInicio.Trim(),
                    Tipo = "date"
                });
            }

            if (!string.IsNullOrWhiteSpace(fechaFin))
            {
                parametros.Add(new PlanillaConsultaParametroDto
                {
                    Nombre = "FechaFinal",
                    Valor = fechaFin.Trim(),
                    Tipo = "date"
                });
            }

            if (!string.IsNullOrWhiteSpace(nombreEmpleado))
            {
                parametros.Add(new PlanillaConsultaParametroDto
                {
                    Nombre = "NombreEmpleado",
                    Valor = nombreEmpleado.Trim(),
                    Tipo = "string"
                });
            }

            var result = await _planillaConsultaService.ConsultarEstadosAsync(
                parametros,
                consulta: "vacaciones",
                maxRows: maxRows,
                cancellationToken: cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Consulta ejecutada correctamente.",
                data = result
            });
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

    private int ResolveIdUsuarioAprueba()
    {
        var rawIdUsuario =
            User.FindFirstValue("IdEmpleado")
            ?? User.FindFirstValue("CodEmp")
            ?? User.FindFirstValue("codEmp")
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("IdUsuario");

        if (int.TryParse(rawIdUsuario, out var idUsuario) && idUsuario > 0)
        {
            return idUsuario;
        }

        throw new InvalidOperationException("No se pudo resolver el IdUsuarioAprueba del usuario autenticado.");
    }
}
