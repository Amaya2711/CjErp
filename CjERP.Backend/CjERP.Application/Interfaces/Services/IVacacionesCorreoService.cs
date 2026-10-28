using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IVacacionesCorreoService
{
    /// <summary>
    /// Genera la carta PDF de la solicitud de vacaciones y la envía a los destinatarios de
    /// Constante.correo_vacaciones con ValorFin = 1. Pensado para la aprobación de la 3ra validación.
    /// </summary>
    Task<VacacionesCorreoResultDto> EnviarCorreoAprobacionFinalAsync(
        int idEmpleadoCj,
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Genera el mismo PDF que se adjunta al correo de la 3ra validación, sin enviarlo (vista previa).
    /// Con <paramref name="autorizado"/> en false (solicitud sin la 3ra aprobación) el PDF lleva la marca de agua "NO AUTORIZADO".
    /// Devuelve null si no se encuentra la solicitud.
    /// </summary>
    Task<(byte[] Contenido, string NombreArchivo)?> GenerarCartaPdfAsync(
        int idEmpleadoCj,
        DateTime fechaInicio,
        DateTime fechaFin,
        bool autorizado = false,
        CancellationToken cancellationToken = default);
}
