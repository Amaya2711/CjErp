using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Repositories;

public interface IGastosExcelSharePointRepository
{
    /// <summary>Gastos de Planilla agregados por site/año/proyecto/cliente/trabajo/tarea/moneda.</summary>
    Task<IReadOnlyList<GastoExcelSharePointDto>> ObtenerGastosAsync(
        int idCliente,
        int estadoPlanilla,
        CancellationToken cancellationToken = default);

    Task<GastosExcelSharePointConfigDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task GuardarConfiguracionAsync(GastosExcelSharePointConfigDto configuracion, string usuario, CancellationToken cancellationToken = default);
    Task<long> IniciarLogAsync(GastosExcelSharePointLogDto log, CancellationToken cancellationToken = default);
    Task FinalizarLogAsync(long id, GastosExcelSharePointLogDto log, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<GastosExcelSharePointLogDto>> ObtenerHistorialAsync(int top, CancellationToken cancellationToken = default);
    Task<GastosExcelSharePointLogDto?> ObtenerLogAsync(long id, CancellationToken cancellationToken = default);
}
