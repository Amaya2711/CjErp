using CjERP.Application.DTOs.ReportesWhatsapp;

namespace CjERP.Application.Interfaces.Services;

public interface IReporteAutomaticoService
{
    Task<ReporteWhatsappConfiguracionDto> ObtenerConfiguracionAsync(string tipoReporte, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappPeriodoDto> ObtenerPeriodoActualAsync(CancellationToken cancellationToken = default);
    Task<ReporteWhatsappDashboardDto> ObtenerDashboardAsync(string idUsuario, string tipoReporte, int topLogs = 200, CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappEjecucionResultadoDto> EjecutarAsync(string tipoReporte, string origenEjecucion, string usuarioEjecucion, bool soloFallidos, CancellationToken cancellationToken = default);
    Task<bool> UsuarioTieneAccesoAdministrativoAsync(string idUsuario, CancellationToken cancellationToken = default);
}

public interface IWupService
{
    Task<ReporteWhatsappSendResponseDto> EnviarAdjuntoAsync(ReporteWhatsappSendRequestDto request, CancellationToken cancellationToken = default);
}

public interface IWupAuthService
{
    Task<string?> ObtenerTokenAsync(CancellationToken cancellationToken = default);
}

public interface IReportePdfService
{
    Task<byte[]> GenerarReportePdfAsync(
        string tipoReporte,
        ReporteWhatsappEmpleadoDto empleadoDestino,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle,
        CancellationToken cancellationToken = default);
}

public interface IReporteWhatsappJobScheduler
{
    Task ReprogramarAsync(string tipoReporte, CancellationToken cancellationToken = default);
    string EncolarEjecucionManual(string tipoReporte, string usuarioEjecucion);
    string EncolarReintentoFallidos(string tipoReporte, string usuarioEjecucion);
}

public interface IReporteWhatsappRuntimeMonitor
{
    bool TryStart(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot);
    void Update(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot);
    void Finish(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot);
    ReporteWhatsappRuntimeStatusDto GetSnapshot(string tipoReporte);
}
