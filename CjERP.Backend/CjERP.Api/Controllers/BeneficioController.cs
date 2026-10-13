using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

/// <summary>Beneficios (adelanto de sueldo / préstamo). Migración de FrmBeneficio (DXAsignacion).</summary>
[ApiController]
[Route("api/admin/beneficios")]
[Authorize]
public class BeneficioController : ControllerBase
{
    private readonly IBeneficioService _beneficioService;

    public BeneficioController(IBeneficioService beneficioService)
    {
        _beneficioService = beneficioService;
    }

    [HttpGet("empleados")]
    public Task<IActionResult> Empleados(CancellationToken cancellationToken) =>
        Ejecutar(async () => Ok(new { success = true, data = await _beneficioService.ListarEmpleadosAsync(cancellationToken) }));

    [HttpGet]
    public Task<IActionResult> Listar(
        [FromQuery] int? idEmpleado,
        [FromQuery] int? idTipoBeneficio,
        [FromQuery] int? idAprobado,
        CancellationToken cancellationToken) =>
        Ejecutar(async () => Ok(new
        {
            success = true,
            data = await _beneficioService.ListarAsync(idEmpleado, idTipoBeneficio, idAprobado, cancellationToken)
        }));

    [HttpGet("{idBeneficio:long}/cronograma")]
    public Task<IActionResult> Cronograma(long idBeneficio, CancellationToken cancellationToken) =>
        Ejecutar(async () => Ok(new { success = true, data = await _beneficioService.ObtenerCronogramaAsync(idBeneficio, cancellationToken) }));

    [HttpGet("{idBeneficio:long}/pdf")]
    public Task<IActionResult> Pdf(long idBeneficio, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            var pdf = await _beneficioService.GenerarPdfAsync(idBeneficio, cancellationToken);
            if (pdf is null)
            {
                return NotFound(new { success = false, message = "No se encontró el beneficio." });
            }

            return File(pdf.Value.Contenido, "application/pdf", pdf.Value.NombreArchivo);
        });

    [HttpPost]
    public Task<IActionResult> Registrar([FromBody] BeneficioRegistrarRequestDto request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            var result = await _beneficioService.RegistrarAsync(request, cancellationToken);
            return Ok(new { success = true, message = "Beneficio registrado correctamente.", data = result });
        });

    [HttpPost("aprobar")]
    public Task<IActionResult> Aprobar([FromBody] BeneficioAccionRequestDto request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            if (request.IdsBeneficio.Count == 0)
            {
                return BadRequest(new { success = false, message = "Seleccione al menos un beneficio." });
            }

            // El aprobador sale del JWT, nunca del body.
            var idAprobador = ResolveIdEmpleadoCj();
            if (idAprobador <= 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "No se pudo identificar al aprobador." });
            }

            var result = await _beneficioService.AprobarAsync(request.IdsBeneficio, idAprobador, cancellationToken);
            return Ok(new { success = true, message = "Proceso de aprobación finalizado.", data = result });
        });

    [HttpPost("rechazar")]
    public Task<IActionResult> Rechazar([FromBody] BeneficioAccionRequestDto request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            if (request.IdsBeneficio.Count == 0)
            {
                return BadRequest(new { success = false, message = "Seleccione al menos un beneficio." });
            }

            var idRechazo = ResolveIdEmpleadoCj();
            if (idRechazo <= 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "No se pudo identificar al usuario." });
            }

            var result = await _beneficioService.RechazarAsync(request.IdsBeneficio, idRechazo, cancellationToken);
            return Ok(new { success = true, message = "Proceso de rechazo finalizado.", data = result });
        });

    private async Task<IActionResult> Ejecutar(Func<Task<IActionResult>> accion)
    {
        try
        {
            return await accion();
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

    /// <summary>IdEmpleado (EmpleadoCj) del usuario autenticado según el JWT; 0 si no se puede resolver.</summary>
    private int ResolveIdEmpleadoCj()
    {
        foreach (var claim in new[] { "IdEmpleadoCj", "CodEmp", "codEmp" })
        {
            if (int.TryParse(User.FindFirstValue(claim), out var id) && id > 0)
            {
                return id;
            }
        }

        return 0;
    }
}
