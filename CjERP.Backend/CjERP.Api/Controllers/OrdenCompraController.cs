using System.Security.Claims;
using System.Globalization;
using System.Text;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/facturacionfinanciera/oc")]
[Authorize]
public class OrdenCompraController : ControllerBase
{
    private const string GestorArchivoUrl = "https://www.elnk.uno/cjmultimedia/mgr001.php";
    private const string GestorArchivoToken = "cjT3l3c0m##";

    private readonly IOrdenCompraService _ordenCompraService;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;
    private readonly IHttpClientFactory _httpClients;
    private readonly ILogger<OrdenCompraController> _logger;

    public OrdenCompraController(
        IOrdenCompraService ordenCompraService,
        IAuditoriaCambiosService auditoriaCambiosService,
        IHttpClientFactory httpClients,
        ILogger<OrdenCompraController> logger)
    {
        _ordenCompraService = ordenCompraService;
        _auditoriaCambiosService = auditoriaCambiosService;
        _httpClients = httpClients;
        _logger = logger;
    }

    [HttpGet("cabecera")]
    public async Task<IActionResult> BuscarCabecera(
        [FromQuery] OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken)
    {
        var data = await _ordenCompraService.BuscarCabeceraAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("detalle")]
    public async Task<IActionResult> BuscarDetalle(
        [FromQuery] OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken)
    {
        var data = await _ordenCompraService.BuscarDetalleAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost]
    public async Task<IActionResult> Insertar(
        [FromBody] OrdenCompraInsertRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdSolicitante <= 0 ||
            request.IdResponsable <= 0 ||
            request.IdValidador <= 0 ||
            request.IdGestor <= 0)
        {
            return BadRequest(new { success = false, message = "La cabecera de la orden de compra estÃ¡ incompleta." });
        }

        if (request.IdMoneda <= 0 || request.IdComprobante <= 0 || request.IdFormaPago <= 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar moneda, comprobante y forma de pago." });
        }

        if (request.Detalle is null || request.Detalle.Count == 0)
        {
            return BadRequest(new { success = false, message = "Debe ingresar al menos una posiciÃ³n." });
        }

        foreach (var item in request.Detalle)
        {
            if (item.IdCliente <= 0 || item.IdProyecto <= 0 || string.IsNullOrWhiteSpace(item.IdSite))
            {
                return BadRequest(new { success = false, message = "Cada posiciÃ³n debe tener cliente, proyecto y site." });
            }

            if (string.IsNullOrWhiteSpace(item.TipoTrabajo) || item.IdTarea is null or <= 0)
            {
                return BadRequest(new { success = false, message = "Cada posiciÃƒÂ³n debe tener tipo de trabajo y tarea." });
            }

            if (item.Cantidad <= 0 || item.PrecioUnitario <= 0 || string.IsNullOrWhiteSpace(item.Detalle))
            {
                return BadRequest(new { success = false, message = "Cada posiciÃ³n debe tener detalle, cantidad y precio unitario vÃ¡lidos." });
            }
        }

        if (string.IsNullOrWhiteSpace(request.UsuarioCreacion))
        {
            request.UsuarioCreacion =
                User.FindFirstValue("IdUsuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.Identity?.Name
                ?? "sistema";
        }

        // La creación de la OC se fecha en el servidor con hora Perú, sin
        // depender de la zona horaria del navegador, contenedor o servidor.
        var fechaHoraPeru = ObtenerFechaHoraPeru();
        request.FechaCreacion = fechaHoraPeru.Date;
        request.HoraCreacion = fechaHoraPeru.TimeOfDay;

        if (request.IdEstado <= 0)
        {
            request.IdEstado = 1;
        }

        request.IdWeb = 1;

        var idOc = await _ordenCompraService.InsertarAsync(request, cancellationToken);
        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildInsertAuditEntries(request, idOc),
            cancellationToken);
        return Ok(new { success = true, message = "Orden de compra creada correctamente.", data = new { idOc } });
    }

    [HttpGet("{idOc:int}/edicion")]
    public async Task<IActionResult> ObtenerEdicion(int idOc, CancellationToken cancellationToken)
    {
        if (idOc <= 0)
        {
            return BadRequest(new { success = false, message = "La orden de compra no es válida." });
        }

        var data = await _ordenCompraService.ObtenerEdicionAsync(idOc, cancellationToken);
        return data is null
            ? NotFound(new { success = false, message = "No se encontró la orden de compra." })
            : Ok(new { success = true, message = "ok", data });
    }

    [HttpPut("{idOc:int}")]
    public async Task<IActionResult> Actualizar(
        int idOc,
        [FromBody] OrdenCompraActualizarRequestDto request,
        CancellationToken cancellationToken)
    {
        if (idOc <= 0 || request.IdOc != idOc)
        {
            return BadRequest(new { success = false, message = "La orden de compra no es válida." });
        }

        if (request.IdSolicitante <= 0 || request.IdResponsable <= 0 || request.IdValidador <= 0 || request.IdGestor <= 0 ||
            request.IdMoneda <= 0 || request.IdComprobante <= 0 || request.IdFormaPago <= 0 || request.Detalle is null || request.Detalle.Count == 0)
        {
            return BadRequest(new { success = false, message = "La cabecera y las posiciones de la orden de compra están incompletas." });
        }

        foreach (var item in request.Detalle)
        {
            var esNuevaPosicion = item.Fila is null or <= 0;
            var datosOperativosIncompletos = item.IdCliente <= 0 || item.IdProyecto <= 0 ||
                string.IsNullOrWhiteSpace(item.IdSite) || string.IsNullOrWhiteSpace(item.TipoTrabajo) ||
                item.IdTarea is null or <= 0;

            if (item.Cantidad <= 0 || item.PrecioUnitario <= 0 || string.IsNullOrWhiteSpace(item.Detalle) ||
                (esNuevaPosicion && datosOperativosIncompletos))
            {
                return BadRequest(new { success = false, message = "Cada posición debe tener sus datos operativos y montos válidos." });
            }
        }

        request.IdWeb = 1;
        await _ordenCompraService.ActualizarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Orden de compra actualizada correctamente.", data = new { idOc } });
    }

    [HttpPost("archivo")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> SubirArchivo(
        [FromForm] OrdenCompraArchivoUploadRequest request,
        CancellationToken cancellationToken)
    {
        var archivo = request.Archivo;
        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar un archivo." });
        }

        var extension = Path.GetExtension(archivo.FileName).ToLowerInvariant();
        var permitidos = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".pdf", ".xls", ".xlsx"
        };

        if (!permitidos.Contains(extension))
        {
            return BadRequest(new { success = false, message = "Formato no permitido. Use imagen, PDF o Excel." });
        }

        try
        {
            await using var stream = archivo.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);

            var payload = new
            {
                token = GestorArchivoToken,
                tipo = "write",
                codigo = string.IsNullOrWhiteSpace(request.CodigoReferencia) ? "1" : request.CodigoReferencia.Trim(),
                nombre = Path.GetFileName(archivo.FileName),
                contenido = Convert.ToBase64String(memory.ToArray())
            };

            using var client = _httpClients.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(2);
            using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(GestorArchivoUrl, content, cancellationToken);
            var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return StatusCode(502, new { success = false, message = "No se pudo subir el archivo al gestor antiguo." });
            }

            var codigo = LimpiarRespuesta(responseText);
            if (string.IsNullOrWhiteSpace(codigo))
            {
                return StatusCode(502, new { success = false, message = "El gestor antiguo no devolviÃƒÂ³ un cÃƒÂ³digo de archivo." });
            }

            return Ok(new { success = true, message = "Archivo cargado correctamente.", data = new { codigo } });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "No se pudo subir archivo de orden de compra al gestor antiguo");
            return StatusCode(502, new { success = false, message = "No se pudo subir el archivo al gestor antiguo." });
        }
    }

    [HttpGet("archivo/{codigo}")]
    public async Task<IActionResult> DescargarArchivo(string codigo, CancellationToken cancellationToken)
    {
        codigo = codigo?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(codigo))
        {
            return BadRequest(new { success = false, message = "No hay ruta de imagen registrada." });
        }

        try
        {
            using var client = _httpClients.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(2);
            async Task<string> RecuperarAsync(string tipo) => LimpiarRespuesta(await client.GetStringAsync(
                $"{GestorArchivoUrl}?i={Uri.EscapeDataString(codigo)}&t={tipo}",
                cancellationToken));

            var nombre = await RecuperarAsync("nombre");
            var contenido = await RecuperarAsync("contenido");
            var bytes = Convert.FromBase64String(contenido);
            var nombreSeguro = Path.GetFileName(nombre);
            if (string.IsNullOrWhiteSpace(nombreSeguro))
            {
                nombreSeguro = $"orden-compra-{codigo}";
            }

            return File(bytes, ObtenerTipoContenido(nombreSeguro));
        }
        catch (FormatException)
        {
            return StatusCode(502, new { success = false, message = "El gestor antiguo devolviÃƒÂ³ un archivo invÃƒÂ¡lido." });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "No se pudo descargar archivo de orden de compra {Codigo}", codigo);
            return StatusCode(502, new { success = false, message = "No se pudo recuperar el archivo desde el gestor antiguo." });
        }
    }

    [HttpPost("rechazar-masivo")]
    public async Task<IActionResult> RechazarMasivo(
        [FromBody] OrdenCompraRechazoMasivoRequestDto request,
        CancellationToken cancellationToken)
    {
        var idsOc = request?.IdsOc?
            .Where(id => id > 0)
            .Distinct()
            .ToArray() ?? [];

        if (idsOc.Length == 0)
        {
            return BadRequest(new { success = false, message = "Seleccione al menos una orden de compra para rechazar." });
        }

        if (string.IsNullOrWhiteSpace(request?.Observacion))
        {
            return BadRequest(new { success = false, message = "Debe ingresar el motivo del rechazo." });
        }

        try
        {
            var aprobadorClaim = User.FindFirstValue("CodEmp")
                ?? User.FindFirstValue("IdEmpleado")
                ?? User.FindFirstValue("CodEmpleadoMostrar");

            var idAprobador = request!.IdAprobador ?? GetNumericUserId(aprobadorClaim);

            if (idAprobador is null or <= 0)
            {
                return BadRequest(new { success = false, message = "No se pudo resolver el aprobador del rechazo." });
            }

            request.IdsOc = idsOc.ToList();
            request.Observacion = request.Observacion.Trim();
            request.IdAprobador = idAprobador;

            await _ordenCompraService.RechazarMasivoAsync(request, cancellationToken);
            await _auditoriaCambiosService.RegistrarLoteAsync(
                BuildRejectAuditEntries(request, ResolveUsuarioAccion()),
                cancellationToken);

            return Ok(new { success = true, message = "Orden(es) de compra rechazada(s) correctamente." });
        }
        catch (SqlException ex)
        {
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("aprobar")]
    public async Task<IActionResult> Aprobar(
        [FromBody] OrdenCompraAprobarRequestDto request,
        CancellationToken cancellationToken)
    {
        var idsOc = request?.IdsOc?
            .Where(id => id > 0)
            .Distinct()
            .ToArray() ?? [];

        if (idsOc.Length == 0)
        {
            return BadRequest(new { success = false, message = "Seleccione al menos una orden de compra para aprobar." });
        }

        try
        {
            var aprobadorClaim = User.FindFirstValue("CodEmp")
                ?? User.FindFirstValue("IdEmpleado")
                ?? User.FindFirstValue("CodEmpleadoMostrar");

            var idAprobador = request!.IdAprobador ?? GetNumericUserId(aprobadorClaim);

            if (idAprobador is null or <= 0)
            {
                return BadRequest(new { success = false, message = "No se pudo resolver el aprobador." });
            }

            request.IdsOc = idsOc.ToList();
            request.IdAprobador = idAprobador;
            request.Observacion = request.Observacion?.Trim() ?? string.Empty;

            var data = await _ordenCompraService.AprobarAsync(request, cancellationToken);
            await _auditoriaCambiosService.RegistrarLoteAsync(
                BuildApprovalAuditEntries(data, ResolveUsuarioAccion(), request.Observacion),
                cancellationToken);

            return Ok(new { success = true, message = "Orden(es) de compra aprobada(s) correctamente.", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("detalle/editar")]
    public async Task<IActionResult> EditarDetalle(
        [FromBody] OrdenCompraEditarDetalleRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { success = false, message = "Debe enviar los datos del detalle a modificar." });
        }

        try
        {
            request.UsuarioAccion = string.IsNullOrWhiteSpace(request.UsuarioAccion)
                ? ResolveUsuarioAccion()
                : request.UsuarioAccion.Trim();

            var data = await _ordenCompraService.EditarDetalleAsync(request, cancellationToken);
            await _auditoriaCambiosService.RegistrarLoteAsync(
                BuildDetailEditAuditEntries(data, request.UsuarioAccion),
                cancellationToken);

            return Ok(new { success = true, message = "Detalle actualizado correctamente.", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
    }

    [HttpGet("recibos/asociados")]
    public async Task<IActionResult> BuscarRecibosAsociados(
        [FromQuery] OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var data = await _ordenCompraService.BuscarRecibosAsociadosAsync(request, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.ToString() });
        }
    }

    [HttpGet("recibos/sin-asociar")]
    public async Task<IActionResult> BuscarRecibosSinAsociar(
        [FromQuery] OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var data = await _ordenCompraService.BuscarRecibosSinAsociarAsync(request, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.ToString() });
        }
    }


    [HttpGet("monto-oc")]
    public async Task<IActionResult> BuscarMontoOc(
        [FromQuery] OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var data = await _ordenCompraService.BuscarMontoOcAsync(request, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.ToString() });
        }
    }

    [HttpGet("consumo")]
    public async Task<IActionResult> BuscarConsumo(
        [FromQuery] OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdOc <= 0)
        {
            return BadRequest(new { success = false, message = "Debe indicar una OC válida." });
        }

        var data = await _ordenCompraService.BuscarConsumoAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("{idOc:int}/pdf")]
    public async Task<IActionResult> DescargarPdf(int idOc, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _ordenCompraService.GenerarPdfAsync(idOc, cancellationToken);
            return File(result.Content, "application/pdf", result.FileName);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo generar el PDF de la orden de compra {IdOc}", idOc);
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.ToString() });
        }
    }

    [HttpPost("recibos/asociar")]
    public async Task<IActionResult> AsociarRecibos(
        [FromBody] OrdenCompraAsociarRecibosRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { success = false, message = "Debe enviar los recibos a asociar." });
        }

        try
        {
            request.Correlativos = request.Correlativos
                .Where(item => item > 0)
                .Distinct()
                .ToList();

            var data = await _ordenCompraService.AsociarRecibosAsync(request, cancellationToken);
            await _auditoriaCambiosService.RegistrarLoteAsync(
                BuildReceiptAssociationAuditEntries(request, data, ResolveUsuarioAccion()),
                cancellationToken);

            return Ok(new { success = true, message = "Recibo(s) asociado(s) correctamente.", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message, detail = ex.ToString() });
        }
    }

    private static int? GetNumericUserId(string? claimValue)
    {
        return int.TryParse(claimValue, out var parsed) ? parsed : null;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private string ResolveUsuarioAccion()
    {
        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }

    private static IEnumerable<AuditoriaCambioDto> BuildInsertAuditEntries(OrdenCompraInsertRequestDto request, int idOc)
    {
        var usuario = string.IsNullOrWhiteSpace(request.UsuarioCreacion)
            ? "sistema"
            : request.UsuarioCreacion.Trim();

        foreach (var entry in BuildHeaderAuditFields(request))
        {
            if (string.IsNullOrWhiteSpace(entry.Value.Value))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "FacturacionFinanciera",
                Entidad = "OrdenCompra",
                IdRegistro = idOc.ToString(CultureInfo.InvariantCulture),
                Accion = "INSERT",
                Seccion = entry.Value.Section,
                Campo = entry.Key,
                ValorAnterior = null,
                ValorNuevo = entry.Value.Value,
                UsuarioAccion = usuario,
                Observacion = "Registro inicial de la orden de compra."
            };
        }

        for (var index = 0; index < request.Detalle.Count; index++)
        {
            var item = request.Detalle[index];
            var posicion = $"Posicion {index + 1}";
            var detalleFields = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["Cliente"] = item.IdCliente.ToString(CultureInfo.InvariantCulture),
                ["Proyecto"] = item.IdProyecto.ToString(CultureInfo.InvariantCulture),
                ["Site"] = NullIfWhiteSpace(item.IdSite),
                ["Correlativo Site"] = item.Correlativo?.ToString(CultureInfo.InvariantCulture),
                ["Tipo Trabajo"] = NullIfWhiteSpace(item.TipoTrabajo),
                ["Tarea"] = item.IdTarea?.ToString(CultureInfo.InvariantCulture),
                ["OT"] = NullIfWhiteSpace(item.Ot),
                ["Detalle"] = NullIfWhiteSpace(item.Detalle),
                ["Cantidad"] = item.Cantidad.ToString("0.##", CultureInfo.InvariantCulture),
                ["Precio Unitario"] = item.PrecioUnitario.ToString("0.##", CultureInfo.InvariantCulture),
                ["Comprobante Detalle"] = item.IdComprobante?.ToString(CultureInfo.InvariantCulture),
                ["Img OC"] = NullIfWhiteSpace(item.ImgOc),
                ["Img Presupuesto"] = NullIfWhiteSpace(item.ImgPresupuesto),
                ["Peso"] = item.Peso.ToString("0.##", CultureInfo.InvariantCulture)
            };

            foreach (var field in detalleFields)
            {
                if (string.IsNullOrWhiteSpace(field.Value))
                {
                    continue;
                }

                yield return new AuditoriaCambioDto
                {
                    Modulo = "FacturacionFinanciera",
                    Entidad = "OrdenCompra",
                    IdRegistro = idOc.ToString(CultureInfo.InvariantCulture),
                    Accion = "INSERT",
                    Seccion = posicion,
                    Campo = field.Key,
                    ValorAnterior = null,
                    ValorNuevo = field.Value,
                    UsuarioAccion = usuario,
                    Observacion = "Registro inicial del detalle de la orden de compra."
                };
            }
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildRejectAuditEntries(
        OrdenCompraRechazoMasivoRequestDto request,
        string usuarioAccion)
    {
        foreach (var idOc in request.IdsOc.Where(id => id > 0).Distinct())
        {
            yield return new AuditoriaCambioDto
            {
                Modulo = "FacturacionFinanciera",
                Entidad = "OrdenCompra",
                IdRegistro = idOc.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Estado",
                Campo = "Estado",
                ValorAnterior = null,
                ValorNuevo = "Rechazado",
                UsuarioAccion = usuarioAccion,
                Observacion = "Rechazo masivo de orden de compra."
            };

            yield return new AuditoriaCambioDto
            {
                Modulo = "FacturacionFinanciera",
                Entidad = "OrdenCompra",
                IdRegistro = idOc.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Estado",
                Campo = "Motivo rechazo",
                ValorAnterior = null,
                ValorNuevo = NullIfWhiteSpace(request.Observacion),
                UsuarioAccion = usuarioAccion,
                Observacion = "Motivo del rechazo de la orden de compra."
            };
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildApprovalAuditEntries(
        IEnumerable<OrdenCompraAprobacionResultDto> results,
        string usuarioAccion,
        string? observacion)
    {
        foreach (var item in results)
        {
            yield return new AuditoriaCambioDto
            {
                Modulo = "FacturacionFinanciera",
                Entidad = "OrdenCompra",
                IdRegistro = item.IdOc.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Aprobacion",
                Campo = $"{item.Nivel} validador",
                ValorAnterior = null,
                ValorNuevo = item.IdAprobador.ToString(CultureInfo.InvariantCulture),
                UsuarioAccion = usuarioAccion,
                Observacion = string.IsNullOrWhiteSpace(observacion)
                    ? $"Aprobacion de nivel {item.Nivel}."
                    : observacion.Trim()
            };
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildDetailEditAuditEntries(
        OrdenCompraEditarDetalleResultDto result,
        string usuarioAccion)
    {
        yield return new AuditoriaCambioDto
        {
            Modulo = "FacturacionFinanciera",
            Entidad = "OrdenCompraDetalle",
            IdRegistro = result.IdOc.ToString(CultureInfo.InvariantCulture),
            Accion = "UPDATE",
            Seccion = $"Site {result.IdSite} / Fila {result.Fila?.ToString(CultureInfo.InvariantCulture) ?? result.Correlativo?.ToString(CultureInfo.InvariantCulture) ?? "-"}",
            Campo = result.Campo,
            ValorAnterior = result.ValorAnterior,
            ValorNuevo = result.ValorNuevo,
            UsuarioAccion = usuarioAccion,
            Observacion = "Edicion del detalle de la orden de compra."
        };
    }

    private static IEnumerable<AuditoriaCambioDto> BuildReceiptAssociationAuditEntries(
        OrdenCompraAsociarRecibosRequestDto request,
        OrdenCompraAsociarRecibosResultDto result,
        string usuarioAccion)
    {
        foreach (var correlativo in request.Correlativos)
        {
            yield return new AuditoriaCambioDto
            {
                Modulo = "FacturacionFinanciera",
                Entidad = "Planilla",
                IdRegistro = correlativo.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "OrdenCompra",
                Campo = "IdOc/Fila",
                ValorAnterior = null,
                ValorNuevo = $"OC {request.IdOc} / Fila {request.Fila?.ToString(CultureInfo.InvariantCulture) ?? "auto"}",
                UsuarioAccion = usuarioAccion,
                Observacion = result.Asociados > 0
                    ? "Asociacion de recibo a orden de compra."
                    : "Intento de asociacion de recibo a orden de compra sin filas afectadas."
            };
        }
    }

    private static Dictionary<string, AuditFieldValue> BuildHeaderAuditFields(OrdenCompraInsertRequestDto request)
    {
        return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["Solicitante"] = new("Cabecera", request.IdSolicitante.ToString(CultureInfo.InvariantCulture)),
            ["Responsable"] = new("Cabecera", request.IdResponsable.ToString(CultureInfo.InvariantCulture)),
            ["Fecha Orden"] = new("Cabecera", request.FechaOrden.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            ["Observacion"] = new("Cabecera", NullIfWhiteSpace(request.Observacion)),
            ["Usuario Creacion"] = new("Cabecera", NullIfWhiteSpace(request.UsuarioCreacion)),
            ["Fecha Creacion"] = new("Cabecera", request.FechaCreacion.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            ["Hora Creacion"] = new("Cabecera", request.HoraCreacion.ToString()),
            ["Moneda"] = new("Cabecera", request.IdMoneda.ToString(CultureInfo.InvariantCulture)),
            ["Comprobante"] = new("Cabecera", request.IdComprobante.ToString(CultureInfo.InvariantCulture)),
            ["Estado"] = new("Cabecera", request.IdEstado.ToString(CultureInfo.InvariantCulture)),
            ["Validador"] = new("Cabecera", request.IdValidador.ToString(CultureInfo.InvariantCulture)),
            ["Gestor"] = new("Cabecera", request.IdGestor.ToString(CultureInfo.InvariantCulture)),
            ["Forma Pago"] = new("Cabecera", request.IdFormaPago.ToString(CultureInfo.InvariantCulture)),
            ["Dias Pago"] = new("Cabecera", request.DiasPago.ToString(CultureInfo.InvariantCulture)),
            ["Peso"] = new("Cabecera", request.Peso.ToString("0.##", CultureInfo.InvariantCulture)),
            ["Id Web"] = new("Cabecera", request.IdWeb.ToString(CultureInfo.InvariantCulture))
        };
    }

    private static string LimpiarRespuesta(string value) => value.Replace("\r", "").Replace("\n", "").Trim().Trim('"');

    private static DateTime ObtenerFechaHoraPeru()
    {
        foreach (var timeZoneId in new[] { "SA Pacific Standard Time", "America/Lima" })
        {
            try
            {
                return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(timeZoneId)).DateTime;
            }
            catch (TimeZoneNotFoundException)
            {
                // Se prueba el identificador de la otra plataforma.
            }
            catch (InvalidTimeZoneException)
            {
                // Se prueba el identificador de la otra plataforma.
            }
        }

        // Perú opera en UTC-5 sin horario de verano. Este respaldo evita usar
        // la hora UTC si el contenedor no expone zonas horarias.
        return DateTime.UtcNow.AddHours(-5);
    }

    private static string ObtenerTipoContenido(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        ".webp" => "image/webp",
        ".xls" => "application/vnd.ms-excel",
        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "application/octet-stream",
    };

    private sealed record AuditFieldValue(string Section, string? Value);

    public sealed class OrdenCompraArchivoUploadRequest
    {
        public IFormFile? Archivo { get; set; }
        public string? CodigoReferencia { get; set; }
    }
}

