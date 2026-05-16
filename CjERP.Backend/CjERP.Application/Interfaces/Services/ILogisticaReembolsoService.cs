using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ILogisticaReembolsoService
{
    Task<IEnumerable<LogisticaReembolsoDto>> BuscarAsync(
        LogisticaReembolsoBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    Task ActualizarAsync(
        LogisticaReembolsoUpdateRequestDto request,
        CancellationToken cancellationToken = default);
}
