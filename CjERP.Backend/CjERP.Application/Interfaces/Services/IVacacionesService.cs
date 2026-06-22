using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IVacacionesService
{
    Task<VacacionesGrabarResultDto> GrabarAsync(
        VacacionesGrabarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionesGrabarResultDto> RechazarAsync(
        VacacionesRechazarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionesGrabarResultDto> AprobarAsync(
        VacacionesAprobarRequestDto request,
        string usuarioAccion,
        int idUsuarioAprueba,
        CancellationToken cancellationToken = default);
}
