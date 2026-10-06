using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IEmpleadoResponsableService
{
    Task<IReadOnlyList<EmpleadoResponsableBuscarDto>> BuscarAsync(string nombreEmpleado, CancellationToken cancellationToken = default);
    Task InsertarAsync(EmpleadoResponsableInsertarRequestDto request, CancellationToken cancellationToken = default);
}
