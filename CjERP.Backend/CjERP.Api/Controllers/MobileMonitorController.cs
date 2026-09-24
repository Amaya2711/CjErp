using System.Security.Claims;
using CjERP.Api.Configuration;
using CjERP.Api.Services;
using CjERP.Application.DTOs.Mobile;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Controllers;

[ApiController, Authorize, Route("api/mobile/admin/monitor")]
public sealed class MobileMonitorController(
    IMobileCommunicationService service,
    IMobileDeviceService devices,
    IOptions<MobileMonitorOptions> options,
    ISharePointCommercialUploadService sharePoint,
    IOptions<SharePointOptions> sharePointOptions) : ControllerBase
{
    private static readonly HashSet<string> AllowedAttachmentExtensions = new(StringComparer.OrdinalIgnoreCase) { ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".jpg", ".jpeg", ".png", ".webp" };
    [HttpGet]
    public async Task<IActionResult> Obtener(CancellationToken cancellationToken)
    {
        if (!int.TryParse(User.FindFirstValue("IdRol"), out var idRol) || !options.Value.AdminRoleIds.Contains(idRol))
            return Forbid();
        return Ok(new { success = true, data = await service.MonitorAsync(cancellationToken) });
    }

    [HttpPost("/api/mobile/admin/comunicaciones")]
    public async Task<IActionResult> Crear([FromBody] MobileCommunicationCreateRequestDto request, CancellationToken cancellationToken)
    {
        if (!Authorized(out var usuario, out var empleado)) return Forbid();
        if (request.Tipo is < 0 or > 5 || request.TipoPersistencia is < 0 or > 3 || string.IsNullOrWhiteSpace(request.Titulo) || string.IsNullOrWhiteSpace(request.Mensaje) || request.Destinatarios is null || request.Destinatarios.Count == 0)
            return BadRequest(new { success = false, message = "Complete tipo, título, mensaje y al menos un destinatario." });
        if (request.TipoPersistencia == 3 && !request.PermiteConfirmacion)
            return BadRequest(new { success = false, message = "Una comunicación obligatoria debe requerir confirmación." });
        if (request.FechaVencimiento.HasValue && request.FechaProgramada.HasValue && request.FechaVencimiento < request.FechaProgramada)
            return BadRequest(new { success = false, message = "La fecha de vencimiento no puede ser anterior a la programada." });
        var result = await service.CrearAsync(request, usuario, empleado, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    [HttpPost("/api/mobile/admin/comunicaciones/{id:long}/adjuntos")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IActionResult> CargarAdjunto(long id, IFormFile? archivo, CancellationToken cancellationToken)
    {
        if (!Authorized(out _, out _)) return Forbid();
        if (id <= 0 || archivo is null || archivo.Length <= 0 || archivo.Length > 15 * 1024 * 1024)
            return BadRequest(new { success = false, message = "Adjunto inválido o mayor a 15 MB." });
        var fileName = Path.GetFileName(archivo.FileName);
        if (string.IsNullOrWhiteSpace(fileName) || !AllowedAttachmentExtensions.Contains(Path.GetExtension(fileName)))
            return BadRequest(new { success = false, message = "Tipo de adjunto no permitido." });

        await using var stream = new MemoryStream();
        await archivo.CopyToAsync(stream, cancellationToken);
        var upload = await sharePoint.UploadBytesAsync(stream.ToArray(), fileName, $"{sharePointOptions.Value.MobileCommunicationsFolderPath.Trim('/')}/{id}", archivo.ContentType ?? "application/octet-stream", cancellationToken: cancellationToken);
        var idAdjunto = await service.CrearAdjuntoAsync(id, upload.FileName, archivo.ContentType ?? "application/octet-stream", archivo.Length, upload.StoragePath, cancellationToken);
        return Ok(new { success = true, data = new { idAdjunto, nombreArchivo = upload.FileName } });
    }

    [HttpGet("/api/mobile/admin/destinatarios")]
    public async Task<IActionResult> BuscarDestinatarios([FromQuery] string? busqueda, [FromQuery] int maximo = 30, CancellationToken cancellationToken = default)
    {
        if (!Authorized(out _, out _)) return Forbid();
        return Ok(new { success = true, data = await service.BuscarDestinatariosAsync(busqueda ?? string.Empty, maximo, cancellationToken) });
    }

    [HttpGet("/api/mobile/admin/comunicaciones/{id:long}/seguimiento")]
    public async Task<IActionResult> ObtenerSeguimiento(long id, CancellationToken cancellationToken)
    {
        if (!Authorized(out _, out _)) return Forbid();
        if (id <= 0) return BadRequest(new { success = false, message = "Id de comunicación inválido." });
        return Ok(new { success = true, data = await service.ObtenerSeguimientoAsync(id, cancellationToken) });
    }

    [HttpGet("/api/mobile/admin/dispositivos")]
    public async Task<IActionResult> ListarDispositivos([FromQuery] bool soloActivos = true, [FromQuery] int maximo = 100, CancellationToken cancellationToken = default)
    {
        if (!Authorized(out _, out _)) return Forbid();
        return Ok(new { success = true, data = await devices.ListarAdminAsync(soloActivos, maximo, cancellationToken) });
    }

    private bool Authorized(out string usuario, out int? empleado)
    {
        usuario = User.FindFirstValue("IdUsuario") ?? string.Empty;
        empleado = int.TryParse(User.FindFirstValue("IdEmpleadoCj"), out var value) ? value : null;
        return !string.IsNullOrWhiteSpace(usuario) && int.TryParse(User.FindFirstValue("IdRol"), out var idRol) && options.Value.AdminRoleIds.Contains(idRol);
    }
}
