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

    public class UploadDescansoAnexoRequest
    {
        public IFormFile? Archivo { get; set; }
        public int IdEmpleadoCj { get; set; }
        public DateTime FechaInicio { get; set; }
        public DateTime FechaFin { get; set; }
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
        [FromQuery] bool soloMios,
        CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            // soloMios: pendientes de los empleados cuyo validador (1ro/2do/3ro) es el usuario del JWT, nunca un id del cliente.
            int? idValidador = null;
            if (soloMios)
            {
                var id = ResolveIdEmpleadoCj();
                if (id <= 0)
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "No se pudo identificar al usuario." });
                }

                idValidador = id;
            }

            return Ok(new
            {
                success = true,
                data = await _descansoService.ListarAsync(idEstado, idEmpleadoCj, fechaInicial, fechaFinal, idValidador, cancellationToken)
            });
        });

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

    /// <summary>Sube el documento anexo a SharePoint (DESCANSO_MEDICO) y lo asocia a una solicitud ya registrada.</summary>
    [HttpPost("anexo")]
    [RequestSizeLimit(10_000_000)]
    public Task<IActionResult> Anexo([FromForm] UploadDescansoAnexoRequest request, CancellationToken cancellationToken) =>
        Ejecutar(async () =>
        {
            if (request.Archivo is null || request.IdEmpleadoCj <= 0)
            {
                return BadRequest(new { success = false, message = "Debe seleccionar un archivo." });
            }

            var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? "sistema";
            var uploadResult = await _sharePointUploadService.UploadExpenseInvoiceAsync(
                request.Archivo,
                new ExpenseInvoiceUploadContext(
                    null,
                    request.IdEmpleadoCj.ToString(),
                    null,
                    usuario,
                    "DESCANSO_MEDICO",
                    "descanso",
                    "descanso"),
                cancellationToken);

            var filas = await _descansoService.ActualizarRutaAsync(
                request.IdEmpleadoCj, request.FechaInicio, request.FechaFin, uploadResult.StoragePath, cancellationToken);
            if (filas <= 0)
            {
                return NotFound(new { success = false, message = "No se encontró la solicitud para asociar el documento." });
            }

            return Ok(new
            {
                success = true,
                message = "Documento anexo cargado correctamente.",
                data = new { fileName = uploadResult.FileName, fileUrl = uploadResult.FileUrl, storagePath = uploadResult.StoragePath }
            });
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

            var motivo = request.Motivo?.Trim();
            if (string.IsNullOrEmpty(motivo))
            {
                return BadRequest(new { success = false, message = "Debe ingresar el motivo del rechazo." });
            }

            if (motivo.Length > 500)
            {
                return BadRequest(new { success = false, message = "El motivo no puede superar los 500 caracteres." });
            }

            var idRechazo = ResolveIdEmpleadoCj();
            if (idRechazo <= 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "No se pudo identificar al usuario." });
            }

            var result = await _descansoService.RechazarAsync(request.Solicitudes, idRechazo, motivo, cancellationToken);
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
