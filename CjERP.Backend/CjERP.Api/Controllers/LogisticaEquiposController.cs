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
    private readonly ILogisticaSolicitudCorreoService _correo;
    private readonly ILogger<LogisticaEquiposController> _logger;

    public LogisticaEquiposController(
        ILogisticaEquiposService service,
        ILogisticaSolicitudCorreoService correo,
        ILogger<LogisticaEquiposController> logger)
    {
        _service = service;
        _correo = correo;
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

    [HttpGet("solicitud/catalogos")]
    public async Task<IActionResult> CatalogosSolicitud(CancellationToken cancellationToken = default)
    {
        var data = await _service.ListarCatalogosSolicitudAsync(cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("solicitud/disponibles")]
    public Task<IActionResult> DisponiblesSolicitud(
        [FromQuery] string? texto,
        [FromQuery] string? idSite,
        [FromQuery] int? correSite,
        [FromQuery] int? idCliente,
        [FromQuery] int? idProyecto,
        CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ListarDisponiblesSolicitudAsync(texto, idSite, correSite, idCliente, idProyecto, cancellationToken), "consultar los equipos disponibles");

    [HttpGet("solicitud/consumibles")]
    public Task<IActionResult> ConsumiblesSolicitud([FromQuery] string? texto, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ListarConsumiblesSolicitudAsync(texto, cancellationToken), "consultar los consumibles");

    /// <summary>Registra la solicitud. Si no requiere aprobacion (estado 3) se envia el PDF por correo; un fallo del correo no la revierte.</summary>
    [HttpPost("solicitud/registrar")]
    public Task<IActionResult> RegistrarSolicitud([FromBody] LogisticaSolicitudRegistrarDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () =>
        {
            var resultado = await _service.RegistrarSolicitudAsync(request, ResolveUsuario(), ResolveIdEmpleadoCj(), cancellationToken);
            if (resultado.IdEstado == 3)
            {
                var (enviado, mensaje) = await _correo.EnviarSolicitudAsync(resultado.NroSolicitud, "PROGRAMACION DESPACHO EQUIPOS", cancellationToken);
                resultado.CorreoEnviado = enviado;
                resultado.CorreoMensaje = mensaje;
            }

            return resultado;
        }, "registrar la solicitud");

    [HttpPost("solicitud/por-aprobar")]
    public Task<IActionResult> PorAprobar([FromBody] LogisticaSolicitudPorAprobarConsultaDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ListarPorAprobarAsync(request, cancellationToken), "consultar las solicitudes por aprobar");

    [HttpGet("solicitud/{nroSolicitud}/detalle")]
    public Task<IActionResult> DetalleSolicitud(string nroSolicitud, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ListarDetalleSolicitudAsync(nroSolicitud, cancellationToken), "consultar el detalle de la solicitud");

    /// <summary>Aprueba u observa solicitudes en estado 9. Al aprobar se envia el PDF por correo; un fallo del correo no revierte la aprobacion.</summary>
    [HttpPost("solicitud/aprobar")]
    public Task<IActionResult> AprobarSolicitudes([FromBody] LogisticaSolicitudAprobarDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () =>
        {
            var resultado = await _service.AprobarSolicitudesAsync(request, ResolveUsuario(), ResolveIdEmpleadoCj(), cancellationToken);
            if (string.Equals(request.Accion, "APROBAR", StringComparison.OrdinalIgnoreCase))
            {
                var fallos = new List<string>();
                foreach (var nro in request.Solicitudes.Distinct())
                {
                    var (enviado, mensaje) = await _correo.EnviarSolicitudAsync(nro, "PROGRAMACION DESPACHO EQUIPOS", cancellationToken);
                    if (enviado) resultado.CorreosEnviados++;
                    else fallos.Add($"{nro}: {mensaje}");
                }

                resultado.CorreoMensaje = fallos.Count == 0 ? null : string.Join(" ", fallos);
            }

            return resultado;
        }, "aprobar u observar las solicitudes");

    [HttpPost("campo/consultar")]
    public Task<IActionResult> ConsultarCampo([FromBody] LogisticaCampoConsultaDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.ConsultarCampoAsync(request, cancellationToken), "consultar las lineas de campo");

    [HttpPost("campo/grabar")]
    public Task<IActionResult> GrabarCampo([FromBody] LogisticaCampoGrabarDto request, CancellationToken cancellationToken = default)
        => Ejecutar(async () => await _service.GrabarCampoAsync(request, ResolveUsuario(), ResolveIdEmpleadoCj(), cancellationToken), "grabar la conformidad de campo");

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
