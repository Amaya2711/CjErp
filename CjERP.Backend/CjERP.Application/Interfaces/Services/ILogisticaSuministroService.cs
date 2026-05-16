using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ILogisticaSuministroService
{
    Task<IEnumerable<LogisticaSuministroDto>> BuscarAsync(
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<int> InsertarAsync(
        LogisticaSuministroInsertRequestDto request,
        CancellationToken cancellationToken = default);

    Task ActualizarAsync(
        LogisticaSuministroUpdateRequestDto request,
        CancellationToken cancellationToken = default);
}
