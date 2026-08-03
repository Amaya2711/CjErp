using CjERP.Application.DTOs.Arrendamientos;

namespace CjERP.Application.Interfaces.Services.Arrendamientos;

public interface IArrendamientosService
{
    Task<ArrendamientosDashboardDto> ObtenerDashboardAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarArrendadoresAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarInquilinosAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarInmueblesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarUnidadesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarContratosAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarObligacionesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarPagosAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarFraccionamientosAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarGarantiasAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarArbitriosAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ListarTiposCambioAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArrendamientosFilaDto>> ConsultarEstadoCuentaAsync(ArrendamientosEstadoCuentaFiltroDto filtro, CancellationToken cancellationToken = default);

    Task<ArrendamientosCommandResultDto> GuardarArrendadorAsync(ArrendamientosCatalogoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarInquilinoAsync(ArrendamientosCatalogoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarInmuebleAsync(ArrendamientosInmuebleRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarUnidadAsync(ArrendamientosUnidadRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarContratoAsync(ArrendamientosContratoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarContratoUnidadAsync(ArrendamientosContratoUnidadRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GenerarObligacionesAsync(ArrendamientosObligacionGenerarRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> RegistrarPagoAsync(ArrendamientosPagoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> AprobarPagoAsync(int idPago, ArrendamientosPagoAprobacionRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> AplicarPagoAsync(int idPago, ArrendamientosPagoAplicacionRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> RevertirPagoAsync(int idPago, string usuarioAccion, string? observacion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarFraccionamientoAsync(ArrendamientosFraccionamientoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarGarantiaAsync(ArrendamientosGarantiaRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarCobranzaGestionAsync(ArrendamientosCobranzaGestionRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarArbitrioAsync(ArrendamientosArbitrioRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ArrendamientosCommandResultDto> GuardarTipoCambioAsync(ArrendamientosTipoCambioRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default);
}
