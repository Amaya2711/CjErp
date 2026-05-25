using System.Security.Claims;
using System.Globalization;
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
    private readonly IOrdenCompraService _ordenCompraService;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public OrdenCompraController(
        IOrdenCompraService ordenCompraService,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _ordenCompraService = ordenCompraService;
        _auditoriaCambiosService = auditoriaCambiosService;
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
            return BadRequest(new { success = false, message = "La cabecera de la orden de compra está incompleta." });
        }

        if (request.IdMoneda <= 0 || request.IdComprobante <= 0 || request.IdFormaPago <= 0)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar moneda, comprobante y forma de pago." });
        }

        if (request.Detalle is null || request.Detalle.Count == 0)
        {
            return BadRequest(new { success = false, message = "Debe ingresar al menos una posición." });
        }

        foreach (var item in request.Detalle)
        {
            if (item.IdCliente <= 0 || item.IdProyecto <= 0 || string.IsNullOrWhiteSpace(item.IdSite))
            {
                return BadRequest(new { success = false, message = "Cada posición debe tener cliente, proyecto y site." });
            }

            if (item.Cantidad <= 0 || item.PrecioUnitario <= 0 || string.IsNullOrWhiteSpace(item.Detalle))
            {
                return BadRequest(new { success = false, message = "Cada posición debe tener detalle, cantidad y precio unitario válidos." });
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

        if (request.FechaCreacion == default)
        {
            request.FechaCreacion = DateTime.Now;
        }

        if (request.HoraCreacion == default)
        {
            request.HoraCreacion = DateTime.Now.TimeOfDay;
        }

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
                ["Detalle"] = NullIfWhiteSpace(item.Detalle),
                ["Cantidad"] = item.Cantidad.ToString("0.##", CultureInfo.InvariantCulture),
                ["Precio Unitario"] = item.PrecioUnitario.ToString("0.##", CultureInfo.InvariantCulture)
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

    private sealed record AuditFieldValue(string Section, string? Value);
}
