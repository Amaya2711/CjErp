using CjERP.Application.DTOs.SqlMonitor;

namespace CjERP.Application.Interfaces.Services;

public interface ISqlMonitorService
{
    Task<SqlMonitorResumenDto> ObtenerResumenAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SqlMonitorQueryDto>> ObtenerQueriesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SqlMonitorSesionActivaDto>> ObtenerSesionesActivasAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SqlMonitorTopSqlDto>> ObtenerTopSqlAsync(string? rango = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SqlMonitorBloqueoDto>> ObtenerBloqueosAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SqlMonitorNetworkDto>> ObtenerNetworkAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SqlMonitorAlertaDto>> ObtenerAlertasAsync(
        string? nivel = null,
        string? tipoAlerta = null,
        string? estado = null,
        DateTime? fecha = null,
        CancellationToken cancellationToken = default);
    Task<SqlMonitorOverheadDto> ObtenerOverheadAsync(CancellationToken cancellationToken = default);
    Task<SqlMonitorQueryDetalleDto?> ObtenerQueryDetalleAsync(long id, CancellationToken cancellationToken = default);
    Task<SqlMonitorAnalisisDto> AnalizarQueryAsync(long id, string? usuario = null, CancellationToken cancellationToken = default);

    Task Capturar30SegundosAsync(CancellationToken cancellationToken = default);
    Task Capturar1MinutoAsync(CancellationToken cancellationToken = default);
    Task Capturar5MinutosAsync(CancellationToken cancellationToken = default);
    Task LimpiarHistoricoAsync(CancellationToken cancellationToken = default);
}
