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

    Task<VacacionOperacionResultDto> GuardarPoliticaAsync(
        VacacionPoliticaGuardarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> GenerarPeriodoAsync(
        VacacionPeriodoGenerarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> GenerarPeriodoMasivoAsync(
        VacacionPeriodoGenerarMasivoRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<VacacionSaldoDto>> ConsultarSaldoAsync(
        int idEmpleado,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<VacacionSolicitudListItemDto>> ListarSolicitudesAsync(
        VacacionSolicitudListarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<VacacionMovimientoListItemDto>> ListarMovimientosAsync(
        VacacionMovimientoListarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> RegistrarSolicitudAsync(
        VacacionSolicitudRegistrarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> AprobarSolicitudAsync(
        VacacionSolicitudAprobarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> RechazarSolicitudAsync(
        VacacionSolicitudRechazarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> CancelarSolicitudAsync(
        VacacionSolicitudCancelarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> FinalizarSolicitudAsync(
        VacacionSolicitudFinalizarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);

    Task<VacacionOperacionResultDto> RevertirMovimientoAsync(
        VacacionMovimientoRevertirRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);
}
