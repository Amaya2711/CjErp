using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IEmpleadoPendienteService
{
    Task<IEnumerable<EmpleadoPendienteDto>> BuscarAsync(
        EmpleadoPendienteBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<EmpleadoPendienteCommandResultDto> InsertarAsync(
        EmpleadoPendienteInsertRequestDto request,
        CancellationToken cancellationToken = default);

    Task<EmpleadoPendienteCommandResultDto> ActualizarAsync(
        EmpleadoPendienteUpdateRequestDto request,
        CancellationToken cancellationToken = default);
}
