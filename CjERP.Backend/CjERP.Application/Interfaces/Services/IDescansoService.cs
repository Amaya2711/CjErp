using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IDescansoService
{
    Task<IReadOnlyList<DescansoEmpleadoDto>> ListarEmpleadosAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DescansoListItemDto>> ListarAsync(
        int? idEstado,
        int? idEmpleadoCj,
        DateTime? fechaInicial,
        DateTime? fechaFinal,
        int? idValidador = null,
        CancellationToken cancellationToken = default);

    /// <summary>Registra una fila por día del rango (estado 97). Devuelve los días registrados.</summary>
    Task<int> RegistrarAsync(DescansoRegistrarRequestDto request, string usuario, CancellationToken cancellationToken = default);

    /// <summary>
    /// Avanza cada solicitud a la siguiente etapa. En la etapa final (100 a 5) marca la asistencia y envía el PDF por correo
    /// a Constante correo_DESCANSO con ValorFin = 1.
    /// </summary>
    Task<IReadOnlyList<DescansoAccionItemResultDto>> AprobarAsync(
        IReadOnlyCollection<DescansoSolicitudKeyDto> solicitudes,
        int idAprobador,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DescansoAccionItemResultDto>> RechazarAsync(
        IReadOnlyCollection<DescansoSolicitudKeyDto> solicitudes,
        int idRechazo,
        string motivo,
        CancellationToken cancellationToken = default);

    /// <summary>PDF de la solicitud (null si no existe).</summary>
    Task<(byte[] Contenido, string NombreArchivo)?> GenerarPdfAsync(
        int idEmpleadoCj,
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken = default);
}
