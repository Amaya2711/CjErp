using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ILogisticaSuministroService
{
    Task<IEnumerable<LogisticaSuministroDto>> BuscarAsync(
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<LogisticaSuministroKpiDto> ObtenerKpisAsync(
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<int> InsertarAsync(
        LogisticaSuministroInsertRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task ActualizarAsync(
        LogisticaSuministroUpdateRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);
}
