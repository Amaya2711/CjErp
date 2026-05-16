using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ILogisticaRecojoService
{
    Task<IEnumerable<LogisticaRecojoDto>> BuscarAsync(
        LogisticaRecojoBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<int> InsertarAsync(
        LogisticaRecojoInsertRequestDto request,
        CancellationToken cancellationToken = default);
}
