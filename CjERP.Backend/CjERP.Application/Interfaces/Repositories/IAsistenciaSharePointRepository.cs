using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Repositories;

public interface IAsistenciaSharePointRepository
{
    Task<IReadOnlyList<AsistenciaSharePointDto>> ObtenerPorFechasAsync(
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken = default);

    Task<AsistenciaSharePointConfigDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task GuardarConfiguracionAsync(AsistenciaSharePointConfigDto configuracion, string usuario, CancellationToken cancellationToken = default);
    Task<long> IniciarLogAsync(AsistenciaSharePointLogDto log, CancellationToken cancellationToken = default);
    Task FinalizarLogAsync(long id, AsistenciaSharePointLogDto log, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AsistenciaSharePointLogDto>> ObtenerHistorialAsync(int top, CancellationToken cancellationToken = default);
    Task<AsistenciaSharePointLogDto?> ObtenerLogAsync(long id, CancellationToken cancellationToken = default);
}
