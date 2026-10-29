using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

/// <summary>Formulario de logistica de equipos (Logistica_v1). Consultas base, stock e ingreso (pedido, recepcion, series y validacion).</summary>
[ApiController]
[Route("api/logistica/equipos")]
[Authorize]
public class LogisticaEquiposController : ControllerBase
{
    private readonly ILogisticaEquiposService _service;
    private readonly ILogger<LogisticaEquiposController> _logger;

    public LogisticaEquiposController(ILogisticaEquiposService service, ILogger<LogisticaEquiposController> logger)
    {
        _service = service;
        _logger = logger;
    }

    [HttpGet("materiales")]
    public async Task<IActionResult> Materiales(
        [FromQuery] string? texto,
        [FromQuery] bool soloActivos = true,
        CancellationToken cancellationToken = default)
    {
        var data = await _service.ListarMaterialesAsync(texto, soloActivos, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("stock")]
    public async Task<IActionResult> Stock(
        [FromQuery] string? texto,
        [FromQuery] bool soloConSaldo = true,
        CancellationToken cancellationToken = default)
    {
        var data = await _service.ConsultarStockAsync(texto, soloConSaldo, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("stock/descuadres")]
    public async Task<IActionResult> Descuadres(CancellationToken cancellationToken = default)
    {
        var data = await _service.ConsultarDescuadresAsync(cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("ingreso/catalogos")]
    public async Task<IActionResult> CatalogosIngreso(CancellationToken cancellationToken = default)
    {
        var data = await _service.ListarCatalogosIngresoAsync(cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost("ingreso/consultar")]
    public Task<IActionResult> ConsultarIngreso([FromBody] LogisticaIngresoConsultaDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ConsultarIngresoAsync(request, cancellationToken), "consultar el ingreso de equipos");

    [HttpPost("ingreso/recepcionar")]
    public Task<IActionResult> Recepcionar([FromBody] LogisticaIngresoCambioEstadoDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.RecepcionarAsync(request, ResolveUsuario(), cancellationToken), "recepcionar equipos");

    [HttpPost("ingreso/validar")]
    public Task<IActionResult> Validar([FromBody] LogisticaIngresoCambioEstadoDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ValidarAsync(request, ResolveUsuario(), cancellationToken), "validar equipos");

    [HttpPost("ingreso/serie")]
    public Task<IActionResult> ActualizarSerie([FromBody] LogisticaIngresoSerieDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () =>
        {
            await _service.ActualizarSerieAsync(request, ResolveUsuario(), cancellationToken);
            return new { };
        }, "actualizar la serie");

    [HttpPost("ingreso/series/importar")]
    public Task<IActionResult> ImportarSeries([FromBody] LogisticaIngresoSerieMasivaDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ImportarSeriesAsync(request, ResolveUsuario(), cancellationToken), "importar series");

    [HttpPost("ingreso/guia")]
    public Task<IActionResult> ActualizarGuia([FromBody] LogisticaIngresoGuiaDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ActualizarGuiaAsync(request, ResolveUsuario(), cancellationToken), "actualizar la guia");

    [HttpPost("pedidos/importar")]
    public Task<IActionResult> ImportarPedido([FromBody] LogisticaPedidoImportarDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ImportarPedidoAsync(request, ResolveUsuario(), ResolveIdEmpleadoCj(), cancellationToken), "importar el pedido");

    [HttpPost("pedidos/importar-secundario")]
    public Task<IActionResult> ImportarSecundario([FromBody] LogisticaSecundarioImportarDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ImportarSecundarioAsync(request, ResolveUsuario(), cancellationToken), "reasignar el pedido");

    /// <summary>Los errores de negocio de los SP llegan como InvalidOperationException y se devuelven como 400 con su mensaje.</summary>
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
            _logger.LogError(ex, "[LogisticaEquiposController] Error al {Accion}.", descripcion);
            return StatusCode(500, new { success = false, message = $"No se pudo {descripcion}.", detail = ex.GetBaseException().Message });
        }
    }

    /// <summary>El sistema antiguo guarda el usuario con un maximo de 10 caracteres.</summary>
    private string ResolveUsuario()
    {
        var usuario = User.FindFirstValue("IdUsuario") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "sistema";
        return usuario.Length > 10 ? usuario[..10] : usuario;
    }

    private int? ResolveIdEmpleadoCj()
    {
        return int.TryParse(User.FindFirstValue("IdEmpleadoCj"), out var id) ? id : null;
    }
}
