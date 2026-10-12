using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IAsistenciaValidarCampoService
{
    Task<AsistenciaValidarCampoListaDto> ListarAsync(
        AsistenciaValidarCampoFiltroDto filtro,
        CancellationToken cancellationToken = default,
        int? idResponsable = null);

    Task<Dictionary<string, object?>?> ObtenerPorClaveAsync(
        AsistenciaValidarCampoClaveDto clave,
        CancellationToken cancellationToken = default,
        int? idResponsable = null);

    Task<AsistenciaValidarCampoOperacionResultadoDto> CrearAsync(
        AsistenciaValidarCampoGuardarDto request,
        CancellationToken cancellationToken = default);

    Task<AsistenciaValidarCampoOperacionResultadoDto> ActualizarAsync(
        AsistenciaValidarCampoGuardarDto request,
        CancellationToken cancellationToken = default);

    Task<AsistenciaValidarCampoOperacionResultadoDto> AprobarIngresoAsync(
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken = default);

    Task<AsistenciaValidarCampoOperacionResultadoDto> AprobarSalidaAsync(
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken = default);

    Task<AsistenciaValidarCampoOperacionResultadoDto> RechazarAsync(
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken = default);
}
