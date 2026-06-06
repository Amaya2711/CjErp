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

    public EmpleadoPendienteController(
        IEmpleadoPendienteService empleadoPendienteService,
        ISharePointCommercialUploadService sharePointCommercialUploadService)
    {
        _empleadoPendienteService = empleadoPendienteService;
        _sharePointCommercialUploadService = sharePointCommercialUploadService;
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

        var result = await _empleadoPendienteService.ActualizarAsync(request, cancellationToken);
        if (result.Resultado <= 0)
        {
            return BadRequest(new { success = false, message = string.IsNullOrWhiteSpace(result.Mensaje) ? "No se pudo actualizar el pendiente." : result.Mensaje });
        }

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
