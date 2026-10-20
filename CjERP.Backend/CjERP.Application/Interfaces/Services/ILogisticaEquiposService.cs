using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

/// <summary>Flujo de logistica de equipos (formulario Logistica_v1). Se amplia por fases, una etapa a la vez.</summary>
public interface ILogisticaEquiposService
{
    Task<IEnumerable<LogisticaMaterialDto>> ListarMaterialesAsync(
        string? texto,
        bool soloActivos,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaStockDto>> ConsultarStockAsync(
        string? texto,
        bool soloConSaldo,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaStockDescuadreDto>> ConsultarDescuadresAsync(
        CancellationToken cancellationToken = default);

    // ---- Ingreso de equipos: Pedido, x Recepcionar, Series y x Validar ----
    Task<IEnumerable<LogisticaIngresoCatalogoDto>> ListarCatalogosIngresoAsync(CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaIngresoLineaDto>> ConsultarIngresoAsync(
        LogisticaIngresoConsultaDto consulta,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCambioEstadoResultDto> RecepcionarAsync(
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCambioEstadoResultDto> ValidarAsync(
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task ActualizarSerieAsync(
        LogisticaIngresoSerieDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCargaResultDto> ImportarSeriesAsync(
        LogisticaIngresoSerieMasivaDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoGuiaResultDto> ActualizarGuiaAsync(
        LogisticaIngresoGuiaDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCargaResultDto> ImportarPedidoAsync(
        LogisticaPedidoImportarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCargaResultDto> ImportarSecundarioAsync(
        LogisticaSecundarioImportarDto request,
        string usuario,
        CancellationToken cancellationToken = default);
}
