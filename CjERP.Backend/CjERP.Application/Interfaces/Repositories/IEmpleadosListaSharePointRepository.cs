using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Repositories;

public interface IEmpleadosListaSharePointRepository
{
    /// <summary>Ejecuta dbo.sp_Consultar_EmpleadoSharepoint y devuelve cada fila como columna → valor (orden de columnas preservado).</summary>
    Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> ConsultarEmpleadosAsync(CancellationToken cancellationToken = default);

    Task<EmpleadosListaSharePointConfigDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task GuardarConfiguracionAsync(EmpleadosListaSharePointConfigDto configuracion, string usuario, CancellationToken cancellationToken = default);
    Task<long> IniciarLogAsync(EmpleadosListaSharePointLogDto log, CancellationToken cancellationToken = default);
    Task FinalizarLogAsync(long id, EmpleadosListaSharePointLogDto log, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<EmpleadosListaSharePointLogDto>> ObtenerHistorialAsync(int top, CancellationToken cancellationToken = default);
    Task<EmpleadosListaSharePointLogDto?> ObtenerLogAsync(long id, CancellationToken cancellationToken = default);
}
