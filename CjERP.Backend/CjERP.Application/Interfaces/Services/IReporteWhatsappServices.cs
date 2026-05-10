using CjERP.Application.DTOs.ReportesWhatsapp;

namespace CjERP.Application.Interfaces.Services;

public interface IReporteAutomaticoService
{
    Task<ReporteWhatsappConfiguracionDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task<ReporteWhatsappPeriodoDto> ObtenerPeriodoActualAsync(CancellationToken cancellationToken = default);
    Task<ReporteWhatsappDashboardDto> ObtenerDashboardAsync(string idUsuario, int topLogs = 200, CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappEjecucionResultadoDto> EjecutarAsync(string origenEjecucion, string usuarioEjecucion, bool soloFallidos, CancellationToken cancellationToken = default);
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
        ReporteWhatsappEmpleadoDto empleado,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle,
        CancellationToken cancellationToken = default);
}

public interface IReporteWhatsappJobScheduler
{
    Task ReprogramarAsync(CancellationToken cancellationToken = default);
    string EncolarEjecucionManual(string usuarioEjecucion);
    string EncolarReintentoFallidos(string usuarioEjecucion);
}

public interface IReporteWhatsappRuntimeMonitor
{
    bool TryStart(ReporteWhatsappRuntimeStatusDto snapshot);
    void Update(ReporteWhatsappRuntimeStatusDto snapshot);
    void Finish(ReporteWhatsappRuntimeStatusDto snapshot);
    ReporteWhatsappRuntimeStatusDto GetSnapshot();
}
