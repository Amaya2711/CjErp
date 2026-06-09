using System.Security.Claims;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Api.Services;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/tesoreria/gastos")]
[Authorize]
public class TesoreriaGastosController : ControllerBase
{
    private readonly ISharePointCommercialUploadService _sharePointCommercialUploadService;
    private readonly IPlanillaService _planillaService;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;
    private readonly ILogger<TesoreriaGastosController> _logger;

    public TesoreriaGastosController(
        ISharePointCommercialUploadService sharePointCommercialUploadService,
        IPlanillaService planillaService,
        IAuditoriaCambiosService auditoriaCambiosService,
        ILogger<TesoreriaGastosController> logger)
    {
        _sharePointCommercialUploadService = sharePointCommercialUploadService;
        _planillaService = planillaService;
        _auditoriaCambiosService = auditoriaCambiosService;
        _logger = logger;
    }

    public class GastoDto
    {
        public int Id { get; set; }
        public long? IdSuministroProvisional { get; set; }
        public string FiltroOperativoKey { get; set; } = string.Empty;
        public string Responsable { get; set; } = string.Empty;
        public int? IdBancoCta { get; set; }
        public int? IdProyecto { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int? CorreSite { get; set; }
        public int? IdTarea { get; set; }
        public int? IdCliente { get; set; }
        public string Cuenta { get; set; } = string.Empty;
        public string CuentaNumero { get; set; } = string.Empty;
        public string CuentaInter { get; set; } = string.Empty;
        public string NombreCta { get; set; } = string.Empty;
        public string Ruc { get; set; } = string.Empty;
        public string TipoPago { get; set; } = string.Empty;
        public string TipoPagoLabel { get; set; } = string.Empty;
        public decimal Monto { get; set; }
        public decimal? Subtotal { get; set; }
        public decimal? Total { get; set; }
        public decimal? Igv { get; set; }
        public int IdRendicion { get; set; }
        public string Detalle { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
        public string FechaVencimiento { get; set; } = string.Empty;
        public string FecIngreso { get; set; } = string.Empty;
        public string FechaEmision { get; set; } = string.Empty;
        public string Solicitante { get; set; } = string.Empty;
        public string SolicitanteLabel { get; set; } = string.Empty;
        public string Gestor { get; set; } = string.Empty;
        public string GestorLabel { get; set; } = string.Empty;
        public string Validador { get; set; } = string.Empty;
        public string ValidadorLabel { get; set; } = string.Empty;
        public string Moneda { get; set; } = string.Empty;
        public string MonedaLabel { get; set; } = string.Empty;
        public string Bien { get; set; } = string.Empty;
        public string BienLabel { get; set; } = string.Empty;
        public string Comprobante { get; set; } = string.Empty;
        public string ComprobanteLabel { get; set; } = string.Empty;
        public string Serie { get; set; } = string.Empty;
        public string FacturaUrl { get; set; } = string.Empty;
        public string FacturaPath { get; set; } = string.Empty;
        public string TipoTrabajo { get; set; } = string.Empty;
        public string SiteNombre { get; set; } = string.Empty;
        public string Usuario { get; set; } = string.Empty;
        public string Ot { get; set; } = string.Empty;
        public decimal? TipoCambio { get; set; }
        public int? IdUsuarioFactura { get; set; }
        public int? Estado { get; set; }

    }

    public class UploadFacturaRequest
    {
        public IFormFile? Archivo { get; set; }
        public int? GastoId { get; set; }
        public string FiltroOperativoKey { get; set; } = string.Empty;
        public string Serie { get; set; } = string.Empty;
        public string Responsable { get; set; } = string.Empty;
    }

    public class RechazarGastoRequest
    {
        public string IdSite { get; set; } = string.Empty;
        public string Observacion { get; set; } = string.Empty;
        public int? IdAprobador { get; set; }
    }

    private static readonly List<GastoDto> Gastos = [];
    private static int _nextId = 1;

    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(new { success = true, message = "ok", data = Gastos });
    }

    [HttpGet("suministros-vigentes")]
    public async Task<IActionResult> ObtenerSuministrosVigentes(
        [FromQuery] int? responsable,
        [FromQuery] int? idTarea,
        [FromQuery] int? idCliente,
        [FromQuery] int? idProyecto,
        [FromQuery] string? idSite,
        [FromQuery] int? correSite,
        [FromQuery] string? tipoTrabajo,
        CancellationToken cancellationToken)
    {
        var data = await _planillaService.ObtenerSuministrosProvisionalesVigentesAsync(
            new SuministroProvisionalVigenteRequestDto
            {
                IdResponsable = responsable,
                IdTarea = idTarea,
                IdCliente = idCliente,
                IdProyecto = idProyecto,
                IdSite = idSite,
                CorreSite = correSite,
                TipoTrabajo = tipoTrabajo ?? string.Empty
            },
            cancellationToken);

        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] GastoDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var gasto = Normalize(dto);
            var planillaRequest = MapToPlanillaRequest(gasto);
            var usuarioAccion = ResolveUsuarioAccion();

            _logger.LogObject(LogLevel.Information, "[TesoreriaGastos] Request recibido para crear planilla", planillaRequest);

            await _planillaService.InsertarPlanillaAsync(planillaRequest, cancellationToken);

            gasto.Id = _nextId++;
            gasto.Usuario = usuarioAccion;
            Gastos.Add(gasto);
            await _auditoriaCambiosService.RegistrarLoteAsync(
                BuildInsertAuditEntries(gasto, usuarioAccion),
                cancellationToken);
            return Ok(new { success = true, message = "Gasto creado", data = gasto });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "[TesoreriaGastos] Validación funcional al insertar en PLANILLA");
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
        catch (SqlException ex)
        {
            if (ex.Number >= 50000)
            {
                _logger.LogWarning(ex, "[TesoreriaGastos] Validación SQL al insertar en PLANILLA");
                return BadRequest(new
                {
                    success = false,
                    message = ex.Message
                });
            }

            _logger.LogError(ex, "[TesoreriaGastos] Error SQL al insertar en PLANILLA");
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[TesoreriaGastos] Error no controlado al insertar en PLANILLA");
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] GastoDto dto, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { success = false, message = "El id del gasto debe ser mayor que cero." });
        }

        try
        {
            var gastoAnterior = Gastos.Find(x => x.Id == id);
            var gastoActualizado = Normalize(dto);
            gastoActualizado.Id = id;
            var usuarioAccion = ResolveUsuarioAccion();
            gastoActualizado.Usuario = usuarioAccion;

            var planillaRequest = MapToPlanillaUpdateRequest(id, gastoActualizado);

            _logger.LogObject(LogLevel.Information, "[TesoreriaGastos] Request recibido para actualizar planilla", planillaRequest);

            await _planillaService.ActualizarPlanillaAsync(planillaRequest, cancellationToken);

            var gastoIndex = Gastos.FindIndex(x => x.Id == id);
            if (gastoIndex >= 0)
            {
                Gastos[gastoIndex] = gastoActualizado;
            }
            else
            {
                Gastos.Add(gastoActualizado);
            }

            await _auditoriaCambiosService.RegistrarLoteAsync(
                BuildUpdateAuditEntries(gastoAnterior, gastoActualizado, usuarioAccion),
                cancellationToken);

            return Ok(new { success = true, message = "Gasto actualizado", data = gastoActualizado });
        }
        catch (SqlException ex)
        {
            if (ex.Number >= 50000)
            {
                _logger.LogWarning(ex, "[TesoreriaGastos] Validación SQL al actualizar PLANILLA");
                return BadRequest(new
                {
                    success = false,
                    message = ex.Message
                });
            }

            _logger.LogError(ex, "[TesoreriaGastos] Error SQL al actualizar PLANILLA");
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[TesoreriaGastos] Error no controlado al actualizar PLANILLA");
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(int id)
    {
        var gasto = Gastos.Find(x => x.Id == id);
        if (gasto == null)
        {
            return NotFound(new { success = false, message = "No encontrado" });
        }

        Gastos.Remove(gasto);
        return Ok(new { success = true, message = "Gasto eliminado" });
    }

    [HttpPost("{id}/rechazar")]
    public async Task<IActionResult> Rechazar(
        int id,
        [FromBody] RechazarGastoRequest request,
        CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { success = false, message = "El id del gasto debe ser mayor que cero." });
        }

        if (string.IsNullOrWhiteSpace(request?.Observacion))
        {
            return BadRequest(new { success = false, message = "Debe ingresar el motivo del rechazo." });
        }

        if (string.IsNullOrWhiteSpace(request.IdSite))
        {
            return BadRequest(new { success = false, message = "El IdSite del registro es obligatorio para rechazar." });
        }

        try
        {
            var aprobadorClaim = User.FindFirstValue("CodEmp")
                ?? User.FindFirstValue("IdEmpleado")
                ?? User.FindFirstValue("CodEmpleadoMostrar");

            var idAprobador = request.IdAprobador ?? GetNumericUserId(aprobadorClaim);

            if (idAprobador is null or <= 0)
            {
                return BadRequest(new { success = false, message = "No se pudo resolver el aprobador del rechazo." });
            }

            var planillaRequest = new PlanillaActualizarEstadoRequestDto
            {
                CodEstado = 3,
                Correlativo = id,
                IdSite = request.IdSite.Trim(),
                IdAprobador = idAprobador,
                Observacion = request.Observacion.Trim()
            };

            _logger.LogObject(LogLevel.Information, "[TesoreriaGastos] Request recibido para rechazar planilla", planillaRequest);

            await _planillaService.ActualizarEstadoPlanillaAsync(planillaRequest, cancellationToken);

            var gastoIndex = Gastos.FindIndex(x => x.Id == id);
            if (gastoIndex >= 0)
            {
                var estadoAnterior = Gastos[gastoIndex].Estado;
                Gastos[gastoIndex].Estado = 3;

                await _auditoriaCambiosService.RegistrarLoteAsync(
                    BuildRejectAuditEntries(
                        Gastos[gastoIndex],
                        estadoAnterior,
                        request.Observacion,
                        ResolveUsuarioAccion()),
                    cancellationToken);
            }

            return Ok(new { success = true, message = "Gasto rechazado correctamente." });
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "[TesoreriaGastos] Error SQL al rechazar PLANILLA");
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[TesoreriaGastos] Error no controlado al rechazar PLANILLA");
            return StatusCode(500, new
            {
                success = false,
                message = ex.Message,
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("upload-factura")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> UploadFactura(
        [FromForm] UploadFacturaRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Archivo is null)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar una imagen." });
        }

        try
        {
            var uploadResult = await _sharePointCommercialUploadService.UploadExpenseInvoiceAsync(
                request.Archivo,
                new ExpenseInvoiceUploadContext(
                    request.GastoId,
                    request.FiltroOperativoKey,
                    request.Serie,
                    request.Responsable,
                    null,
                    "gastos",
                    "gasto"),
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Factura cargada correctamente.",
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

    private static GastoDto Normalize(GastoDto dto)
    {
        return new GastoDto
        {
            Id = dto.Id,
            IdSuministroProvisional = dto.IdSuministroProvisional,
            FiltroOperativoKey = dto.FiltroOperativoKey?.Trim() ?? string.Empty,
            Responsable = dto.Responsable?.Trim() ?? string.Empty,
            IdBancoCta = dto.IdBancoCta,
            IdProyecto = dto.IdProyecto,
            IdSite = dto.IdSite?.Trim() ?? string.Empty,
            CorreSite = dto.CorreSite,
            IdTarea = dto.IdTarea,
            IdCliente = dto.IdCliente,
            Cuenta = dto.Cuenta?.Trim() ?? string.Empty,
            CuentaNumero = dto.CuentaNumero?.Trim() ?? string.Empty,
            CuentaInter = dto.CuentaInter?.Trim() ?? string.Empty,
            NombreCta = dto.NombreCta?.Trim() ?? string.Empty,
            Ruc = dto.Ruc?.Trim() ?? string.Empty,
            TipoPago = dto.TipoPago?.Trim() ?? string.Empty,
            TipoPagoLabel = dto.TipoPagoLabel?.Trim() ?? string.Empty,
            Monto = dto.Monto,
            Subtotal = dto.Subtotal,
            Total = dto.Total,
            Igv = dto.Igv,
            IdRendicion = dto.IdRendicion,
            Detalle = dto.Detalle?.Trim() ?? string.Empty,
            Comentario = dto.Comentario?.Trim() ?? string.Empty,
            FechaVencimiento = dto.FechaVencimiento?.Trim() ?? string.Empty,
            FecIngreso = dto.FecIngreso?.Trim() ?? string.Empty,
            FechaEmision = dto.FechaEmision?.Trim() ?? string.Empty,
            Solicitante = dto.Solicitante?.Trim() ?? string.Empty,
            SolicitanteLabel = dto.SolicitanteLabel?.Trim() ?? string.Empty,
            Gestor = dto.Gestor?.Trim() ?? string.Empty,
            GestorLabel = dto.GestorLabel?.Trim() ?? string.Empty,
            Validador = dto.Validador?.Trim() ?? string.Empty,
            ValidadorLabel = dto.ValidadorLabel?.Trim() ?? string.Empty,
            Moneda = dto.Moneda?.Trim() ?? string.Empty,
            MonedaLabel = dto.MonedaLabel?.Trim() ?? string.Empty,
            Bien = dto.Bien?.Trim() ?? string.Empty,
            BienLabel = dto.BienLabel?.Trim() ?? string.Empty,
            Comprobante = dto.Comprobante?.Trim() ?? string.Empty,
            ComprobanteLabel = dto.ComprobanteLabel?.Trim() ?? string.Empty,
            Serie = dto.Serie?.Trim() ?? string.Empty,
            FacturaUrl = dto.FacturaUrl?.Trim() ?? string.Empty,
            FacturaPath = dto.FacturaPath?.Trim() ?? string.Empty,
            TipoTrabajo = dto.TipoTrabajo?.Trim() ?? string.Empty,
            SiteNombre = dto.SiteNombre?.Trim() ?? string.Empty,
            Usuario = dto.Usuario?.Trim() ?? string.Empty,
            Ot = dto.Ot?.Trim() ?? string.Empty,
            TipoCambio = dto.TipoCambio,
            IdUsuarioFactura = dto.IdUsuarioFactura,
            Estado = dto.Estado
        };
    }

    private PlanillaInsertRequestDto MapToPlanillaRequest(GastoDto dto)
    {
        var usuarioClaim = User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? dto.Usuario;
        var codEmpClaim = User.FindFirstValue("CodEmp");

        return new PlanillaInsertRequestDto
        {
            IdSuministroProvisional = dto.IdSuministroProvisional,
            FiltroOperativoKey = dto.FiltroOperativoKey,
            Responsable = dto.Responsable,
            IdBancoCta = dto.IdBancoCta,
            IdProyecto = dto.IdProyecto,
            IdSite = dto.IdSite,
            CorreSite = dto.CorreSite,
            IdTarea = dto.IdTarea,
            IdCliente = dto.IdCliente,
            Cuenta = dto.Cuenta,
            CuentaNumero = dto.CuentaNumero,
            CuentaInter = dto.CuentaInter,
            NombreCta = dto.NombreCta,
            Ruc = dto.Ruc,
            TipoPago = dto.TipoPago,
            TipoPagoLabel = dto.TipoPagoLabel,
            Monto = dto.Monto,
            Subtotal = dto.Subtotal,
            Total = dto.Total,
            Igv = dto.Igv,
            IdRendicion = dto.IdRendicion,
            Detalle = dto.Detalle,
            Comentario = dto.Comentario,
            FechaVencimiento = dto.FechaVencimiento,
            FechaEmision = dto.FechaEmision,
            Solicitante = dto.Solicitante,
            SolicitanteLabel = dto.SolicitanteLabel,
            Gestor = dto.Gestor,
            GestorLabel = dto.GestorLabel,
            Validador = dto.Validador,
            ValidadorLabel = dto.ValidadorLabel,
            Moneda = dto.Moneda,
            MonedaLabel = dto.MonedaLabel,
            Bien = dto.Bien,
            BienLabel = dto.BienLabel,
            Comprobante = dto.Comprobante,
            ComprobanteLabel = dto.ComprobanteLabel,
            Serie = dto.Serie,
            FacturaUrl = dto.FacturaUrl,
            FacturaPath = dto.FacturaPath,
            TipoTrabajo = dto.TipoTrabajo,
            SiteNombre = dto.SiteNombre,
            Usuario = usuarioClaim?.Trim() ?? string.Empty,
            Ot = dto.Ot,
            TipoCambio = dto.TipoCambio,
            IdUsuarioFactura = dto.IdUsuarioFactura ?? GetNumericUserId(codEmpClaim) ?? GetNumericUserId(usuarioClaim)
        };
    }

    private PlanillaUpdateRequestDto MapToPlanillaUpdateRequest(int correlativo, GastoDto dto)
    {
        var planillaRequest = MapToPlanillaRequest(dto);

        return new PlanillaUpdateRequestDto
        {
            Correlativo = correlativo,
            IdSuministroProvisional = planillaRequest.IdSuministroProvisional,
            FiltroOperativoKey = planillaRequest.FiltroOperativoKey,
            Responsable = planillaRequest.Responsable,
            IdBancoCta = planillaRequest.IdBancoCta,
            IdProyecto = planillaRequest.IdProyecto,
            IdSite = planillaRequest.IdSite,
            CorreSite = planillaRequest.CorreSite,
            IdTarea = planillaRequest.IdTarea,
            IdCliente = planillaRequest.IdCliente,
            Cuenta = planillaRequest.Cuenta,
            CuentaNumero = planillaRequest.CuentaNumero,
            CuentaInter = planillaRequest.CuentaInter,
            NombreCta = planillaRequest.NombreCta,
            Ruc = planillaRequest.Ruc,
            TipoPago = planillaRequest.TipoPago,
            TipoPagoLabel = planillaRequest.TipoPagoLabel,
            Monto = planillaRequest.Monto,
            Subtotal = planillaRequest.Subtotal,
            Total = planillaRequest.Total,
            Igv = planillaRequest.Igv,
            IdRendicion = planillaRequest.IdRendicion,
            Detalle = planillaRequest.Detalle,
            Comentario = planillaRequest.Comentario,
            FechaVencimiento = planillaRequest.FechaVencimiento,
            FechaEmision = planillaRequest.FechaEmision,
            Solicitante = planillaRequest.Solicitante,
            SolicitanteLabel = planillaRequest.SolicitanteLabel,
            Gestor = planillaRequest.Gestor,
            GestorLabel = planillaRequest.GestorLabel,
            Validador = planillaRequest.Validador,
            ValidadorLabel = planillaRequest.ValidadorLabel,
            Moneda = planillaRequest.Moneda,
            MonedaLabel = planillaRequest.MonedaLabel,
            Bien = planillaRequest.Bien,
            BienLabel = planillaRequest.BienLabel,
            Comprobante = planillaRequest.Comprobante,
            ComprobanteLabel = planillaRequest.ComprobanteLabel,
            Serie = planillaRequest.Serie,
            FacturaUrl = planillaRequest.FacturaUrl,
            FacturaPath = planillaRequest.FacturaPath,
            TipoTrabajo = planillaRequest.TipoTrabajo,
            SiteNombre = planillaRequest.SiteNombre,
            Usuario = planillaRequest.Usuario,
            Ot = planillaRequest.Ot,
            TipoCambio = planillaRequest.TipoCambio,
            IdUsuarioFactura = planillaRequest.IdUsuarioFactura
        };
    }

    private static int? GetNumericUserId(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return null;
        }

        var digits = new string(rawValue.Where(char.IsDigit).ToArray());
        return int.TryParse(digits, out var numericUserId) ? numericUserId : null;
    }

    private string ResolveUsuarioAccion()
    {
        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }

    private static IEnumerable<AuditoriaCambioDto> BuildInsertAuditEntries(GastoDto gasto, string usuarioAccion)
    {
        return BuildAuditFieldValues(gasto)
            .Where(static item => !string.IsNullOrWhiteSpace(item.Value.Value))
            .Select(item => new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "GastoPlanilla",
                IdRegistro = gasto.Id.ToString(CultureInfo.InvariantCulture),
                Accion = "INSERT",
                Seccion = item.Value.Section,
                Campo = item.Key,
                ValorAnterior = null,
                ValorNuevo = item.Value.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Registro inicial del gasto."
            });
    }

    private static IEnumerable<AuditoriaCambioDto> BuildUpdateAuditEntries(
        GastoDto? gastoAnterior,
        GastoDto gastoActualizado,
        string usuarioAccion)
    {
        var anteriores = BuildAuditFieldValues(gastoAnterior);
        var actuales = BuildAuditFieldValues(gastoActualizado);

        foreach (var actual in actuales)
        {
            anteriores.TryGetValue(actual.Key, out var anterior);
            var valorAnterior = anterior?.Value;

            if (string.Equals(valorAnterior, actual.Value.Value, StringComparison.Ordinal))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "GastoPlanilla",
                IdRegistro = gastoActualizado.Id.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = actual.Value.Section,
                Campo = actual.Key,
                ValorAnterior = valorAnterior,
                ValorNuevo = actual.Value.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Actualizacion del gasto."
            };
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildRejectAuditEntries(
        GastoDto gasto,
        int? estadoAnterior,
        string observacion,
        string usuarioAccion)
    {
        return
        [
            new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "GastoPlanilla",
                IdRegistro = gasto.Id.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Estado",
                Campo = "Estado",
                ValorAnterior = FormatNullableInt(estadoAnterior),
                ValorNuevo = FormatNullableInt(gasto.Estado),
                UsuarioAccion = usuarioAccion,
                Observacion = "Rechazo del gasto."
            },
            new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "GastoPlanilla",
                IdRegistro = gasto.Id.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Estado",
                Campo = "Motivo rechazo",
                ValorAnterior = null,
                ValorNuevo = NullIfWhiteSpace(observacion),
                UsuarioAccion = usuarioAccion,
                Observacion = "Motivo de rechazo del gasto."
            }
        ];
    }

    private static Dictionary<string, AuditFieldValue> BuildAuditFieldValues(GastoDto? gasto)
    {
        if (gasto is null)
        {
            return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase);
        }

        return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["Id Suministro Provisional"] = new("Filtro Operativo", FormatNullableLong(gasto.IdSuministroProvisional)),
            ["Filtro Operativo Key"] = new("Filtro Operativo", NullIfWhiteSpace(gasto.FiltroOperativoKey)),
            ["Cliente"] = new("Filtro Operativo", FormatNullableInt(gasto.IdCliente)),
            ["Proyecto"] = new("Filtro Operativo", FormatNullableInt(gasto.IdProyecto)),
            ["Site"] = new("Filtro Operativo", NullIfWhiteSpace(gasto.IdSite)),
            ["CorreSite"] = new("Filtro Operativo", FormatNullableInt(gasto.CorreSite)),
            ["Tarea"] = new("Filtro Operativo", FormatNullableInt(gasto.IdTarea)),
            ["Tipo Trabajo"] = new("Filtro Operativo", NullIfWhiteSpace(gasto.TipoTrabajo)),
            ["OT"] = new("Filtro Operativo", NullIfWhiteSpace(gasto.Ot)),
            ["Site Nombre"] = new("Filtro Operativo", NullIfWhiteSpace(gasto.SiteNombre)),
            ["Responsable"] = new("Responsable y Cuenta", NullIfWhiteSpace(gasto.Responsable)),
            ["Id Banco Cta"] = new("Responsable y Cuenta", FormatNullableInt(gasto.IdBancoCta)),
            ["Cuenta"] = new("Responsable y Cuenta", NullIfWhiteSpace(gasto.Cuenta)),
            ["Cuenta Numero"] = new("Responsable y Cuenta", NullIfWhiteSpace(gasto.CuentaNumero)),
            ["Cuenta Interbancaria"] = new("Responsable y Cuenta", NullIfWhiteSpace(gasto.CuentaInter)),
            ["Nombre Cuenta"] = new("Responsable y Cuenta", NullIfWhiteSpace(gasto.NombreCta)),
            ["Ruc"] = new("Responsable y Cuenta", NullIfWhiteSpace(gasto.Ruc)),
            ["Tipo Pago"] = new("Pago e Importes", NullIfWhiteSpace(gasto.TipoPago)),
            ["Tipo Pago Label"] = new("Pago e Importes", NullIfWhiteSpace(gasto.TipoPagoLabel)),
            ["Monto"] = new("Pago e Importes", FormatDecimal(gasto.Monto)),
            ["Subtotal"] = new("Pago e Importes", FormatNullableDecimal(gasto.Subtotal)),
            ["IGV"] = new("Pago e Importes", FormatNullableDecimal(gasto.Igv)),
            ["Total"] = new("Pago e Importes", FormatNullableDecimal(gasto.Total)),
            ["Tipo Cambio"] = new("Pago e Importes", FormatNullableDecimal(gasto.TipoCambio)),
            ["Moneda"] = new("Pago e Importes", NullIfWhiteSpace(gasto.Moneda)),
            ["Moneda Label"] = new("Pago e Importes", NullIfWhiteSpace(gasto.MonedaLabel)),
            ["Id Rendicion"] = new("Pago e Importes", gasto.IdRendicion > 0 ? gasto.IdRendicion.ToString(CultureInfo.InvariantCulture) : null),
            ["Bien"] = new("Documento", NullIfWhiteSpace(gasto.Bien)),
            ["Bien Label"] = new("Documento", NullIfWhiteSpace(gasto.BienLabel)),
            ["Comprobante"] = new("Documento", NullIfWhiteSpace(gasto.Comprobante)),
            ["Comprobante Label"] = new("Documento", NullIfWhiteSpace(gasto.ComprobanteLabel)),
            ["Serie"] = new("Documento", NullIfWhiteSpace(gasto.Serie)),
            ["Detalle"] = new("Documento", NullIfWhiteSpace(gasto.Detalle)),
            ["Comentario"] = new("Documento", NullIfWhiteSpace(gasto.Comentario)),
            ["FecIngreso"] = new("Fechas", NullIfWhiteSpace(gasto.FecIngreso)),
            ["Fecha Emision"] = new("Fechas", NullIfWhiteSpace(gasto.FechaEmision)),
            ["Fecha Vencimiento"] = new("Fechas", NullIfWhiteSpace(gasto.FechaVencimiento)),
            ["Solicitante"] = new("Flujo", NullIfWhiteSpace(gasto.Solicitante)),
            ["Solicitante Label"] = new("Flujo", NullIfWhiteSpace(gasto.SolicitanteLabel)),
            ["Gestor"] = new("Flujo", NullIfWhiteSpace(gasto.Gestor)),
            ["Gestor Label"] = new("Flujo", NullIfWhiteSpace(gasto.GestorLabel)),
            ["Validador"] = new("Flujo", NullIfWhiteSpace(gasto.Validador)),
            ["Validador Label"] = new("Flujo", NullIfWhiteSpace(gasto.ValidadorLabel)),
            ["Estado"] = new("Flujo", FormatNullableInt(gasto.Estado)),
            ["Id Usuario Factura"] = new("Flujo", FormatNullableInt(gasto.IdUsuarioFactura)),
            ["Factura URL"] = new("Adjuntos", NullIfWhiteSpace(gasto.FacturaUrl)),
            ["Factura Path"] = new("Adjuntos", NullIfWhiteSpace(gasto.FacturaPath)),
            ["Usuario"] = new("Sistema", NullIfWhiteSpace(gasto.Usuario))
        };
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string? FormatNullableInt(int? value)
        => value.HasValue ? value.Value.ToString(CultureInfo.InvariantCulture) : null;

    private static string? FormatNullableLong(long? value)
        => value.HasValue ? value.Value.ToString(CultureInfo.InvariantCulture) : null;

    private static string? FormatNullableDecimal(decimal? value)
        => value.HasValue ? value.Value.ToString("0.##", CultureInfo.InvariantCulture) : null;

    private static string FormatDecimal(decimal value)
        => value.ToString("0.##", CultureInfo.InvariantCulture);

    private sealed record AuditFieldValue(string Section, string? Value);
}
