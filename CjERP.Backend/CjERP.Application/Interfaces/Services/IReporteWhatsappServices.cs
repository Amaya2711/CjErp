using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IReporteAutomaticoService
{
    Task<ReporteWhatsappConfiguracionDto> ObtenerConfiguracionAsync(string tipoReporte, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappPeriodoDto> ObtenerPeriodoActualAsync(CancellationToken cancellationToken = default);
    Task<ReporteWhatsappDashboardDto> ObtenerDashboardAsync(string idUsuario, string tipoReporte, string? periodo = null, int topLogs = 200, CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappEjecucionResultadoDto> EjecutarAsync(string tipoReporte, string origenEjecucion, string usuarioEjecucion, bool soloFallidos, string? periodo = null, IReadOnlyList<int>? idsEmpleadoSeleccionados = null, CancellationToken cancellationToken = default);
    Task<ReporteWhatsappManualSendResultDto> EnviarMensajeManualAsync(ReporteWhatsappManualSendRequestDto request, string usuarioEjecucion, CancellationToken cancellationToken = default);
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

    Task<byte[]> GenerarReporteEmpleadoValidacionPdfAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarReporteGerencialEjecutivoPdfAsync(
        AsistenciaGerencialPdfDto reporte,
        CancellationToken cancellationToken = default);
}

public interface IReporteWhatsappJobScheduler
{
    Task ReprogramarAsync(string tipoReporte, CancellationToken cancellationToken = default);
    string EncolarEjecucionManual(string tipoReporte, string usuarioEjecucion, string? periodo = null, IReadOnlyList<int>? idsEmpleadoSeleccionados = null);
    string EncolarReintentoFallidos(string tipoReporte, string usuarioEjecucion, string? periodo = null, IReadOnlyList<int>? idsEmpleadoSeleccionados = null);
}

public interface IReporteWhatsappRuntimeMonitor
{
    bool TryStart(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot);
    void Update(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot);
    void Finish(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot);
    ReporteWhatsappRuntimeStatusDto GetSnapshot(string tipoReporte);
}
