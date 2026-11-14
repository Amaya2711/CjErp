using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/administracion/pendientes")]
[Authorize]
public class EmpleadoPendienteController : ControllerBase
{
    private readonly IEmpleadoPendienteService _empleadoPendienteService;
    private readonly ISharePointCommercialUploadService _sharePointCommercialUploadService;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;
    private readonly ILogger<EmpleadoPendienteController> _logger;

    private const int IdEstadoRechazado = 5;

    public EmpleadoPendienteController(
        IEmpleadoPendienteService empleadoPendienteService,
        ISharePointCommercialUploadService sharePointCommercialUploadService,
        IAuditoriaCambiosService auditoriaCambiosService,
        ILogger<EmpleadoPendienteController> logger)
    {
        _empleadoPendienteService = empleadoPendienteService;
        _sharePointCommercialUploadService = sharePointCommercialUploadService;
        _auditoriaCambiosService = auditoriaCambiosService;
        _logger = logger;
    }

    public class UploadPendienteArchivoRequest
    {
        public IFormFile? Archivo { get; set; }
        public int? IdPendiente { get; set; }
        public int? IdEmpleado { get; set; }
        public string? Usuario { get; set; }
    }

    [HttpPost("buscar")]
    public async Task<IActionResult> Buscar(
        [FromBody] EmpleadoPendienteBuscarRequestDto request,
        CancellationToken cancellationToken)
    {
        var data = await _empleadoPendienteService.BuscarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost("pdf")]
    public async Task<IActionResult> Pdf(
        [FromBody] EmpleadoPendientePdfRequestDto request,
        CancellationToken cancellationToken)
    {
        var pdf = await _empleadoPendienteService.GenerarPdfAsync(request, cancellationToken);
        if (pdf is null)
        {
            return NotFound(new { success = false, message = "No hay pendientes para generar el PDF." });
        }

        return File(pdf.Value.Contenido, "application/pdf", pdf.Value.NombreArchivo);
    }

    [HttpPost("insertar")]
    public async Task<IActionResult> Insertar(
        [FromBody] EmpleadoPendienteInsertRequestDto request,
        CancellationToken cancellationToken)
    {
        var validationError = ValidateInsertRequest(request);
        if (validationError is not null)
        {
            return BadRequest(new { success = false, message = validationError });
        }

        if (string.IsNullOrWhiteSpace(request.UsuarioCreacion))
        {
            request.UsuarioCreacion =
                User.FindFirstValue("IdUsuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.Identity?.Name
                ?? "sistema";
        }

        var result = await _empleadoPendienteService.InsertarAsync(request, cancellationToken);
        if (result.Resultado <= 0)
        {
            return BadRequest(new { success = false, message = string.IsNullOrWhiteSpace(result.Mensaje) ? "No se pudo registrar el pendiente." : result.Mensaje });
        }

        return Ok(new
        {
            success = true,
            message = string.IsNullOrWhiteSpace(result.Mensaje) ? "Pendiente registrado correctamente." : result.Mensaje,
            data = new { idPendiente = result.IdPendiente }
        });
    }

    [HttpPost("actualizar")]
    public async Task<IActionResult> Actualizar(
        [FromBody] EmpleadoPendienteUpdateRequestDto request,
        CancellationToken cancellationToken)
    {
        var validationError = ValidateUpdateRequest(request);
        if (validationError is not null)
        {
            return BadRequest(new { success = false, message = validationError });
        }

        if (string.IsNullOrWhiteSpace(request.UsuarioModificacion))
        {
            request.UsuarioModificacion =
                User.FindFirstValue("IdUsuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.Identity?.Name
                ?? "sistema";
        }

        // Valores previos para la auditoría (solo edición/rechazo; el registro nuevo no se audita).
        EmpleadoPendienteDto? anterior = null;
        try
        {
            anterior = (await _empleadoPendienteService.BuscarAsync(
                new EmpleadoPendienteBuscarRequestDto { IdPendiente = request.IdPendiente },
                cancellationToken)).FirstOrDefault();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Pendientes] No se pudo leer el estado previo para auditoría. IdPendiente={IdPendiente}", request.IdPendiente);
        }

        var result = await _empleadoPendienteService.ActualizarAsync(request, cancellationToken);
        if (result.Resultado <= 0)
        {
            return BadRequest(new { success = false, message = string.IsNullOrWhiteSpace(result.Mensaje) ? "No se pudo actualizar el pendiente." : result.Mensaje });
        }

        await RegistrarAuditoriaActualizacionAsync(anterior, request, cancellationToken);

        return Ok(new
        {
            success = true,
            message = string.IsNullOrWhiteSpace(result.Mensaje) ? "Pendiente actualizado correctamente." : result.Mensaje
        });
    }

    [HttpPost("upload-archivo")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> UploadArchivo(
        [FromForm] UploadPendienteArchivoRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Archivo is null)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar un archivo." });
        }

        try
        {
            var usuario = string.IsNullOrWhiteSpace(request.Usuario)
                ? User.FindFirstValue("IdUsuario")
                    ?? User.FindFirstValue(ClaimTypes.Name)
                    ?? User.Identity?.Name
                    ?? "sistema"
                : request.Usuario.Trim();

            var uploadResult = await _sharePointCommercialUploadService.UploadExpenseInvoiceAsync(
                request.Archivo,
                new ExpenseInvoiceUploadContext(
                    request.IdPendiente,
                    request.IdEmpleado?.ToString(),
                    request.IdPendiente?.ToString(),
                    usuario,
                    "PENDIENTES",
                    "pendientes",
                    "pendiente"),
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Archivo cargado correctamente.",
                data = new
                {
                    fileName = uploadResult.FileName,
                    fileUrl = uploadResult.FileUrl,
                    storagePath = uploadResult.StoragePath
                }
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    private async Task RegistrarAuditoriaActualizacionAsync(
        EmpleadoPendienteDto? anterior,
        EmpleadoPendienteUpdateRequestDto nuevo,
        CancellationToken cancellationToken)
    {
        if (anterior is null)
        {
            return;
        }

        try
        {
            var esRechazo = nuevo.IdEstado == IdEstadoRechazado && anterior.IdEstado != IdEstadoRechazado;
            var accion = esRechazo ? "RECHAZAR" : "EDITAR";
            var usuario = nuevo.UsuarioModificacion ?? "sistema";
            var cambios = new List<AuditoriaCambioDto>();

            void Comparar(string campo, string? antes, string? despues)
            {
                if (string.Equals(antes ?? string.Empty, despues ?? string.Empty, StringComparison.Ordinal))
                {
                    return;
                }

                cambios.Add(new AuditoriaCambioDto
                {
                    Modulo = "ADMINISTRACION",
                    Entidad = "EmpleadoPendiente",
                    IdRegistro = nuevo.IdPendiente.ToString(),
                    Accion = accion,
                    Seccion = "Pendientes",
                    Campo = campo,
                    ValorAnterior = antes,
                    ValorNuevo = despues,
                    UsuarioAccion = usuario
                });
            }

            static string? Fecha(DateTime? value) => value?.ToString("yyyy-MM-dd");
            static string? Texto(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

            Comparar("IdEmpleado", anterior.IdEmpleado.ToString(), nuevo.IdEmpleado.ToString());
            Comparar("FechaInicio", Fecha(anterior.FechaInicio), Fecha(nuevo.FechaInicio));
            Comparar("FechaEstimacionTermino", Fecha(anterior.FechaEstimacionTermino), Fecha(nuevo.FechaEstimacionTermino));
            Comparar("FechaRealTermino", Fecha(anterior.FechaRealTermino), Fecha(nuevo.FechaRealTermino));
            Comparar("IdEstado", anterior.IdEstado?.ToString(), nuevo.IdEstado?.ToString());
            Comparar("Comentario", Texto(anterior.Comentario), Texto(nuevo.Comentario));
            Comparar("Observacion", Texto(anterior.Observacion), Texto(nuevo.Observacion));
            Comparar("IdResponsable", anterior.IdResponsable?.ToString(), nuevo.IdResponsable?.ToString());
            Comparar("Ruta", Texto(anterior.Ruta), Texto(nuevo.Ruta));

            if (cambios.Count > 0)
            {
                await _auditoriaCambiosService.RegistrarLoteAsync(cambios, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            // La auditoría no debe revertir ni bloquear la actualización ya realizada.
            _logger.LogError(ex, "[Pendientes] No se pudo registrar la auditoría. IdPendiente={IdPendiente}", nuevo.IdPendiente);
        }
    }

    private static string? ValidateInsertRequest(EmpleadoPendienteInsertRequestDto request)
    {
        if (request.IdEmpleado <= 0)
        {
            return "Empleado es obligatorio.";
        }

        if (!request.FechaInicio.HasValue)
        {
            return "Fecha inicio es obligatoria.";
        }

        return null;
    }

    private static string? ValidateUpdateRequest(EmpleadoPendienteUpdateRequestDto request)
    {
        if (request.IdPendiente <= 0)
        {
            return "IdPendiente es obligatorio.";
        }

        if (request.IdEmpleado <= 0)
        {
            return "Empleado es obligatorio.";
        }

        if (!request.FechaInicio.HasValue)
        {
            return "Fecha inicio es obligatoria.";
        }

        if (!request.IdEstado.HasValue || request.IdEstado <= 0)
        {
            return "Estado es obligatorio.";
        }

        return null;
    }
}
