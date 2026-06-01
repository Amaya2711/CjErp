using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ICompensacionService
{
    Task<IReadOnlyList<CompensacionDto>> ListarAsync(CompensacionFiltroDto filtro, CancellationToken cancellationToken = default);
    Task<int> CrearAsync(CompensacionUpsertDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task ActualizarAsync(int id, CompensacionUpsertDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task EliminarAsync(int id, string usuarioAccion, CancellationToken cancellationToken = default);
}
