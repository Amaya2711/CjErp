using CjERP.Application.DTOs.ReportesWhatsapp;

namespace CjERP.Application.Interfaces.Repositories;

public interface IReporteRepository
{
    Task<ReporteWhatsappConfiguracionDto?> ObtenerConfiguracionAsync(string tipoReporte, CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosDestinoAsync(string tipoReporte, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosReporteGerencialAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosFallidosAsync(DateTime fechaProceso, string tipoReporte, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReporteWhatsappAsistenciaItemDto>> ObtenerReporteAsistenciaAsync(string fechaInicio, string fechaFin, int idEmpleado, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReporteWhatsappAsistenciaItemDto>> ObtenerReporteAsistenciaPeriodoAsync(string fechaInicio, string fechaFin, CancellationToken cancellationToken = default);
    Task<bool> ExisteEnvioExitosoAsync(int idEmpleado, DateTime fechaProceso, string tipoReporte, CancellationToken cancellationToken = default);
    Task InsertarLogAsync(ReporteWhatsappLogDto log, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReporteWhatsappLogDto>> ObtenerLogsAsync(DateTime? fechaProceso, string tipoReporte, int top, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappKpiDto> ObtenerKpisAsync(DateTime? fechaProceso, string tipoReporte, CancellationToken cancellationToken = default);
    Task<bool> UsuarioTieneAccesoAdministrativoAsync(string idUsuario, IEnumerable<string> rolesPermitidos, CancellationToken cancellationToken = default);
}
