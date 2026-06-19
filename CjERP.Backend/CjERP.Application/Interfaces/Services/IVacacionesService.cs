using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IVacacionesService
{
    Task<VacacionesGrabarResultDto> GrabarAsync(
        VacacionesGrabarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);
}
