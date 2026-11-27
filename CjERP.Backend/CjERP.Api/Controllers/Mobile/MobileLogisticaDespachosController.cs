using System.Security.Claims;
using CjERP.Api.Authorization;
using CjERP.Api.Configuration;
using CjERP.Api.Services;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Controllers.Mobile;

/// <summary>
/// App móvil de logística: etapa «x Despachar». Es una capa delgada: toda la regla de negocio vive en
/// <see cref="ILogisticaEquiposService"/> y en los SP de Database/Logistica/25 (reglas: docs/mobile/despachos-reglas-legado.md).
/// Permisos (app MOB_LOGISTICA; SegRolMenuPermiso del menú MOB_LOG_DESPACHOS, rol "Despachador móvil" ligado a la app en SegRolApp):
///   Ver = consultar y ver series; Editar = despachar y subir la foto; Aprobar = rechazar.
/// </summary>
[ApiController, Authorize, Route("api/mobile/logistica/despachos")]
public sealed class MobileLogisticaDespachosController : ControllerBase
{
    private const string App = "MOB_LOGISTICA";
    private const string Menu = "MOB_LOG_DESPACHOS";
    private const string FolderKeyDespachos = "despachos";

    private readonly ILogisticaEquiposService _service;
    private readonly ISharePointCommercialUploadService _uploads;
    private readonly SharePointOptions _sharePoint;
    private readonly ILogger<MobileLogisticaDespachosController> _logger;

    public MobileLogisticaDespachosController(
        ILogisticaEquiposService service,
        ISharePointCommercialUploadService uploads,
        IOptions<SharePointOptions> sharePoint,
        ILogger<MobileLogisticaDespachosController> logger)
    {
        _service = service;
        _uploads = uploads;
        _sharePoint = sharePoint.Value;
        _logger = logger;
    }

    public class SubirImagenRequest
    {
        public IFormFile? Archivo { get; set; }
        public string? NroSolicitud { get; set; }
        public string? Posicion { get; set; }
    }

    /// <summary>Líneas pendientes de despachar (estado 3 o 4).</summary>
    [HttpGet]
    [RequiereMenu(App, Menu, MenuAccion.Ver)]
    public Task<IActionResult> Consultar([FromQuery] LogisticaDespachoConsultaDto consulta, CancellationToken ct)
        => Ejecutar(async () => await _service.ConsultarDespachoAsync(consulta, ct), "consultar los despachos pendientes");

    /// <summary>Series libres de un material (solo equipos, código 40).</summary>
    [HttpGet("series")]
    [RequiereMenu(App, Menu, MenuAccion.Ver)]
    public Task<IActionResult> Series([FromQuery] string codPap, [FromQuery] string? buscar, CancellationToken ct)
        => Ejecutar(async () => await _service.ListarSeriesDespachoAsync(codPap, buscar, ct), "consultar las series");

    /// <summary>Sube la foto del despacho (obligatoria) y devuelve la ruta para enviarla al despachar.</summary>
    [HttpPost("imagen")]
    [RequiereMenu(App, Menu, MenuAccion.Editar)]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> SubirImagen([FromForm] SubirImagenRequest request, CancellationToken ct)
    {
        if (request.Archivo is null)
            return BadRequest(new { success = false, message = "Debe tomar o seleccionar una imagen." });

        // Sin carpeta configurada el servicio caería en la carpeta de gastos: se exige configurarla.
        if (!_sharePoint.FolderPaths.ContainsKey(FolderKeyDespachos))
            return BadRequest(new { success = false, message = "Falta configurar SharePoint:FolderPaths:despachos en el servidor." });

        try
        {
            var resultado = await _uploads.UploadExpenseInvoiceAsync(
                request.Archivo,
                new ExpenseInvoiceUploadContext(
                    null,
                    request.NroSolicitud,
                    request.Posicion,
                    ResolveUsuario(),
                    null,
                    FolderKeyDespachos,
                    "despacho"),
                ct);

            // DetSolicitud.RutaImagen admite 150 caracteres; se avisa antes de intentar despachar con una ruta que no cabe.
            if (resultado.StoragePath.Length > 150)
                return BadRequest(new { success = false, message = "La ruta de la imagen supera los 150 caracteres admitidos. Acorte la carpeta SharePoint:FolderPaths:despachos." });

            return Ok(new
            {
                success = true,
                message = "Imagen cargada correctamente.",
                data = new { fileName = resultado.FileName, fileUrl = resultado.FileUrl, storagePath = resultado.StoragePath }
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    /// <summary>Despacha líneas (3/4 → 5). Foto obligatoria; serie obligatoria en equipos; cantidad parcial solo en no equipos.</summary>
    [HttpPost("despachar")]
    [RequiereMenu(App, Menu, MenuAccion.Editar)]
    public Task<IActionResult> Despachar([FromBody] LogisticaDespachoGrabarDto request, CancellationToken ct)
        => Ejecutar(async () => await _service.GrabarDespachoAsync(request, ResolveUsuario(), ResolveIdEmpleadoCj(), ct), "despachar");

    /// <summary>Rechaza líneas en despacho (3/4 → 6). El motivo es obligatorio.</summary>
    [HttpPost("rechazar")]
    [RequiereMenu(App, Menu, MenuAccion.Aprobar)]
    public Task<IActionResult> Rechazar([FromBody] LogisticaDespachoRechazarDto request, CancellationToken ct)
        => Ejecutar(async () => await _service.RechazarDespachoAsync(request, ResolveUsuario(), ResolveIdEmpleadoCj(), ct), "rechazar el despacho");

    private async Task<IActionResult> Ejecutar<T>(Func<Task<T>> accion, string descripcion)
    {
        try
        {
            var data = await accion();
            return Ok(new { success = true, message = "ok", data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[MobileLogisticaDespachos] Error al {Accion}.", descripcion);
            return StatusCode(500, new { success = false, message = $"No se pudo {descripcion}." });
        }
    }

    /// <summary>El sistema antiguo guarda el usuario con un máximo de 10 caracteres.</summary>
    private string ResolveUsuario()
    {
        var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "sistema";
        return usuario.Length > 10 ? usuario[..10] : usuario;
    }

    private int? ResolveIdEmpleadoCj()
        => int.TryParse(User.FindFirstValue("IdEmpleadoCj"), out var id) ? id : null;
}
