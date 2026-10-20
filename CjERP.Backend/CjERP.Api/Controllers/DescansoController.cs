using System.Security.Claims;
using CjERP.Api.Services;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

/// <summary>Descanso médico. Migración de frmDescanso (DXAsignacion).</summary>
[ApiController]
[Route("api/admin/descanso")]
[Authorize]
public class DescansoController : ControllerBase
{
    private readonly IDescansoService _descansoService;
    private readonly ISharePointCommercialUploadService _sharePointUploadService;

    public DescansoController(IDescansoService descansoService, ISharePointCommercialUploadService sharePointUploadService)
    {
        _descansoService = descansoService;
        _sharePointUploadService = sharePointUploadService;
    }

    public class UploadDescansoAdjuntoRequest
    {
        public IFormFile? Archivo { get; set; }
        public int? IdEmpleadoCj { get; set; }
    }

    [HttpGet("empleados")]
    public Task<IActionResult> Empleados(CancellationToken cancellationToken) =>
        Ejecutar(async () => Ok(new { success = true, data = await _descansoService.ListarEmpleadosAsync(cancellationToken) }));

    [HttpGet]
    public Task<IActionResult> Listar(
        [FromQuery] int? idEstado,
        [FromQuery] int? idEmpleadoCj,
        [FromQuery] DateTime? fechaInicial,
        [FromQuery] DateTime? fechaFinal,
        CancellationToken cancellationToken) =>
        Ejecutar(async () => Ok(new
        {
            success = true,
            data = await _descansoService.ListarAsync(idEstado, idEmpleadoCj, fechaInicial, fechaFinal, cancellationToken)
        }));

    [HttpGet("pdf")]
    public Task<IActionResult> Pdf(
        [FromQuery] int idEmpleadoCj,
        [FromQuery] DateTime fechaInicio,
        [FromQuery] DateTime fechaFin,
        CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            var pdf = await _descansoService.GenerarPdfAsync(idEmpleadoCj, fechaInicio, fechaFin, cancellationToken);
            if (pdf is null)
            {
                return NotFound(new { success = false, message = "No se encontró la solicitud." });
            }

            return File(pdf.Value.Contenido, "application/pdf", pdf.Value.NombreArchivo);
        });

    /// <summary>Sube el documento sustento (certificado) a SharePoint y devuelve su ruta para registrarla en la solicitud.</summary>
    [HttpPost("adjunto")]
    [RequestSizeLimit(10_000_000)]
    public Task<IActionResult> Adjunto([FromForm] UploadDescansoAdjuntoRequest request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            if (request.Archivo is null)
            {
                return BadRequest(new { success = false, message = "Debe seleccionar un archivo." });
            }

            var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? "sistema";
            var uploadResult = await _sharePointUploadService.UploadExpenseInvoiceAsync(
                request.Archivo,
                new ExpenseInvoiceUploadContext(
                    null,
                    request.IdEmpleadoCj?.ToString(),
                    null,
                    usuario,
                    "DESCANSO_MEDICO",
                    "descanso",
                    "descanso"),
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Archivo cargado correctamente.",
                data = new { fileName = uploadResult.FileName, fileUrl = uploadResult.FileUrl, storagePath = uploadResult.StoragePath }
            });
        });

    [HttpPost]
    public Task<IActionResult> Registrar([FromBody] DescansoRegistrarRequestDto request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? "sistema";
            var dias = await _descansoService.RegistrarAsync(request, usuario, cancellationToken);
            return Ok(new { success = true, message = "Descanso registrado correctamente.", data = new { diasRegistrados = dias } });
        });

    [HttpPost("aprobar")]
    public Task<IActionResult> Aprobar([FromBody] DescansoAccionRequestDto request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            if (request.Solicitudes.Count == 0)
            {
                return BadRequest(new { success = false, message = "Seleccione al menos una solicitud." });
            }

            // El aprobador sale del JWT, nunca del body.
            var idAprobador = ResolveIdEmpleadoCj();
            if (idAprobador <= 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "No se pudo identificar al aprobador." });
            }

            var result = await _descansoService.AprobarAsync(request.Solicitudes, idAprobador, cancellationToken);
            return Ok(new { success = true, message = "Proceso de aprobación finalizado.", data = result });
        });

    [HttpPost("rechazar")]
    public Task<IActionResult> Rechazar([FromBody] DescansoAccionRequestDto request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            if (request.Solicitudes.Count == 0)
            {
                return BadRequest(new { success = false, message = "Seleccione al menos una solicitud." });
            }

            var idRechazo = ResolveIdEmpleadoCj();
            if (idRechazo <= 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "No se pudo identificar al usuario." });
            }

            var result = await _descansoService.RechazarAsync(request.Solicitudes, idRechazo, cancellationToken);
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
