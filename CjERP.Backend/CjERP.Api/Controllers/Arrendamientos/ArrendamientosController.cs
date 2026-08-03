using System.Security.Claims;
using CjERP.Application.DTOs.Arrendamientos;
using CjERP.Application.Interfaces.Services.Arrendamientos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers.Arrendamientos;

// ROLLBACK-MARKER: ARRRENDAMIENTOS CONTROLLER START
[ApiController]
[Route("api/arrendamientos")]
[Authorize]
public class ArrendamientosController : ControllerBase
{
    private readonly IArrendamientosService _arrendamientosService;
    private readonly ILogger<ArrendamientosController> _logger;

    public ArrendamientosController(
        IArrendamientosService arrendamientosService,
        ILogger<ArrendamientosController> logger)
    {
        _arrendamientosService = arrendamientosService;
        _logger = logger;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> ObtenerDashboard(CancellationToken cancellationToken)
    {
        var data = await _arrendamientosService.ObtenerDashboardAsync(cancellationToken);
        return Ok(new { success = true, message = "Dashboard obtenido correctamente.", data });
    }

    [HttpGet("arrendadores")]
    public async Task<IActionResult> ListarArrendadores(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarArrendadoresAsync(cancellationToken));

    [HttpGet("inquilinos")]
    public async Task<IActionResult> ListarInquilinos(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarInquilinosAsync(cancellationToken));

    [HttpGet("inmuebles")]
    public async Task<IActionResult> ListarInmuebles(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarInmueblesAsync(cancellationToken));

    [HttpGet("unidades")]
    public async Task<IActionResult> ListarUnidades(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarUnidadesAsync(cancellationToken));

    [HttpGet("contratos")]
    public async Task<IActionResult> ListarContratos(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarContratosAsync(cancellationToken));

    [HttpGet("obligaciones")]
    public async Task<IActionResult> ListarObligaciones(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarObligacionesAsync(cancellationToken));

    [HttpGet("pagos")]
    public async Task<IActionResult> ListarPagos(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarPagosAsync(cancellationToken));

    [HttpGet("fraccionamientos")]
    public async Task<IActionResult> ListarFraccionamientos(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarFraccionamientosAsync(cancellationToken));

    [HttpGet("garantias")]
    public async Task<IActionResult> ListarGarantias(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarGarantiasAsync(cancellationToken));

    [HttpGet("arbitrios")]
    public async Task<IActionResult> ListarArbitrios(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarArbitriosAsync(cancellationToken));

    [HttpGet("tipos-cambio")]
    public async Task<IActionResult> ListarTiposCambio(CancellationToken cancellationToken)
        => await ResponderLista(() => _arrendamientosService.ListarTiposCambioAsync(cancellationToken));

    [HttpGet("estado-cuenta")]
    public async Task<IActionResult> ConsultarEstadoCuenta(
        [FromQuery] ArrendamientosEstadoCuentaFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var data = await _arrendamientosService.ConsultarEstadoCuentaAsync(filtro, cancellationToken);
        return Ok(new { success = true, message = "Estado de cuenta obtenido correctamente.", data });
    }

    [HttpPost("arrendadores")]
    public async Task<IActionResult> GuardarArrendador(
        [FromBody] ArrendamientosCatalogoRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarArrendadorAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("inquilinos")]
    public async Task<IActionResult> GuardarInquilino(
        [FromBody] ArrendamientosCatalogoRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarInquilinoAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("inmuebles")]
    public async Task<IActionResult> GuardarInmueble(
        [FromBody] ArrendamientosInmuebleRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarInmuebleAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("unidades")]
    public async Task<IActionResult> GuardarUnidad(
        [FromBody] ArrendamientosUnidadRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarUnidadAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("contratos")]
    public async Task<IActionResult> GuardarContrato(
        [FromBody] ArrendamientosContratoRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarContratoAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("contratos/unidades")]
    public async Task<IActionResult> GuardarContratoUnidad(
        [FromBody] ArrendamientosContratoUnidadRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarContratoUnidadAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("obligaciones/generar")]
    public async Task<IActionResult> GenerarObligaciones(
        [FromBody] ArrendamientosObligacionGenerarRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GenerarObligacionesAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("pagos")]
    public async Task<IActionResult> RegistrarPago(
        [FromBody] ArrendamientosPagoRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.RegistrarPagoAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("pagos/{idPago:int}/aprobar")]
    public async Task<IActionResult> AprobarPago(
        int idPago,
        [FromBody] ArrendamientosPagoAprobacionRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.AprobarPagoAsync(idPago, request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("pagos/{idPago:int}/aplicar")]
    public async Task<IActionResult> AplicarPago(
        int idPago,
        [FromBody] ArrendamientosPagoAplicacionRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.AplicarPagoAsync(idPago, request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("pagos/{idPago:int}/revertir")]
    public async Task<IActionResult> RevertirPago(
        int idPago,
        [FromBody] ArrendamientosPagoRevertirRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.RevertirPagoAsync(idPago, ObtenerUsuarioAccion(), request.Observacion, cancellationToken));

    [HttpPost("fraccionamientos")]
    public async Task<IActionResult> GuardarFraccionamiento(
        [FromBody] ArrendamientosFraccionamientoRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarFraccionamientoAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("garantias")]
    public async Task<IActionResult> GuardarGarantia(
        [FromBody] ArrendamientosGarantiaRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarGarantiaAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("cobranzas")]
    public async Task<IActionResult> GuardarCobranza(
        [FromBody] ArrendamientosCobranzaGestionRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarCobranzaGestionAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("arbitrios")]
    public async Task<IActionResult> GuardarArbitrio(
        [FromBody] ArrendamientosArbitrioRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarArbitrioAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    [HttpPost("tipos-cambio")]
    public async Task<IActionResult> GuardarTipoCambio(
        [FromBody] ArrendamientosTipoCambioRequestDto request,
        CancellationToken cancellationToken)
        => await ResponderGuardado(() => _arrendamientosService.GuardarTipoCambioAsync(request, ObtenerUsuarioAccion(), cancellationToken));

    private async Task<IActionResult> ResponderLista(Func<Task<IReadOnlyList<ArrendamientosFilaDto>>> resolver)
    {
        var data = await resolver();
        return Ok(new { success = true, message = "Consulta ejecutada correctamente.", data });
    }

    private async Task<IActionResult> ResponderGuardado(Func<Task<ArrendamientosCommandResultDto>> resolver)
    {
        var result = await resolver();
        return Ok(new
        {
            success = result.Success,
            message = result.Message,
            data = result
        });
    }

    private string ObtenerUsuarioAccion()
    {
        return User.FindFirstValue("IdUsuario")
               ?? User.FindFirstValue(ClaimTypes.Name)
               ?? User.Identity?.Name
               ?? "sistema";
    }
}
// ROLLBACK-MARKER: ARRRENDAMIENTOS CONTROLLER END
