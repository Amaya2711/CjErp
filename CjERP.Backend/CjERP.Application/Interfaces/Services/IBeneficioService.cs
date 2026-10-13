using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IBeneficioService
{
    Task<IReadOnlyList<BeneficioEmpleadoDto>> ListarEmpleadosAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<BeneficioListItemDto>> ListarAsync(
        int? idEmpleado,
        int? idTipoBeneficio,
        int? idAprobado,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<BeneficioCuotaDto>> ObtenerCronogramaAsync(long idBeneficio, CancellationToken cancellationToken = default);

    Task<BeneficioRegistrarResultDto> RegistrarAsync(BeneficioRegistrarRequestDto request, CancellationToken cancellationToken = default);

    /// <summary>Aprueba cada beneficio pendiente y envía el PDF por correo (Constante correo_beneficio, ValorFin = 1).</summary>
    Task<IReadOnlyList<BeneficioAccionItemResultDto>> AprobarAsync(
        IReadOnlyCollection<long> idsBeneficio,
        int idAprobador,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<BeneficioAccionItemResultDto>> RechazarAsync(
        IReadOnlyCollection<long> idsBeneficio,
        int idRechazo,
        CancellationToken cancellationToken = default);

    /// <summary>PDF de la solicitud (null si el beneficio no existe).</summary>
    Task<(byte[] Contenido, string NombreArchivo)?> GenerarPdfAsync(long idBeneficio, CancellationToken cancellationToken = default);
}
