using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IChequeEmpleadoService
{
    Task<IReadOnlyList<ChequeEmpleadoDto>> ListarAsync(
        ChequeEmpleadoFiltroDto filtro,
        CancellationToken cancellationToken = default);

    Task<ChequeEmpleadoDto?> ObtenerAsync(
        int idCheque,
        CancellationToken cancellationToken = default);

    Task<ChequeEmpleadoOperacionResultadoDto> CrearAsync(
        ChequeEmpleadoGuardarDto request,
        CancellationToken cancellationToken = default);

    Task<ChequeEmpleadoOperacionResultadoDto> ActualizarAsync(
        ChequeEmpleadoGuardarDto request,
        CancellationToken cancellationToken = default);

    Task<ChequeEmpleadoOperacionResultadoDto> RechazarAsync(
        int idCheque,
        ChequeEmpleadoRechazarDto request,
        CancellationToken cancellationToken = default);
}
