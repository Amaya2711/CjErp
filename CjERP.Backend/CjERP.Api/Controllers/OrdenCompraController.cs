using System.Security.Claims;
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

    public OrdenCompraController(IOrdenCompraService ordenCompraService)
    {
        _ordenCompraService = ordenCompraService;
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
}
