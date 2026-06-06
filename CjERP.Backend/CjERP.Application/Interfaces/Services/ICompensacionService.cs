using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ICompensacionService
{
    Task<IReadOnlyList<CompensacionDto>> ListarAsync(CompensacionFiltroDto filtro, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CompensacionSaldoDto>> ListarSaldosAsync(CancellationToken cancellationToken = default);
    Task<CompensacionDto?> ObtenerPorIdAsync(long id, CancellationToken cancellationToken = default);
    Task<CompensacionSaldoDto?> ObtenerSaldoAsync(int idEmpleadoCj, CancellationToken cancellationToken = default);
    Task<long> CrearAsync(CompensacionUpsertDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task<ProcesarCompensacionResultDto> ProcesarAsync(ProcesarCompensacionRequestDto request, string usuarioAccion, int? idEmpleadoAccion, CancellationToken cancellationToken = default);
    Task ActualizarAsync(long id, CompensacionUpsertDto request, string usuarioAccion, CancellationToken cancellationToken = default);
    Task EliminarAsync(long id, string usuarioAccion, CancellationToken cancellationToken = default);
}
