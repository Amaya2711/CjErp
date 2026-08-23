using CjERP.Application.DTOs;
using CjERP.Application.DTOs.ReportesWhatsapp;

namespace CjERP.Application.Interfaces.Services;

public interface IAsistenciaReporteService
{
    Task<IEnumerable<AsistenciaReporteDto>> BuscarAsync(
        AsistenciaReporteRequestDto request,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfGerencialAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfEmpleadoValidacionAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfEmpleadoLlamadaAtencionAsync(
        AsistenciaReportePdfRequestDto request,
        string usuarioEjecucion,
        CancellationToken cancellationToken = default);

    Task<ReporteWhatsappSendResponseDto> EnviarPdfEmpleadoLlamadaAtencionAsync(
        AsistenciaReportePdfRequestDto request,
        string usuarioEjecucion,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfEmpleadoLlamadaAtencionVistaPreviaAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task<bool> ExistePdfLlamadaAtencionEnviadoHoyAsync(
        int idEmpleado,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<int>> ObtenerPdfLlamadaAtencionEnviadosHoyAsync(
        IReadOnlyList<int> idsEmpleado,
        CancellationToken cancellationToken = default);

    Task<AsistenciaTrackingConsultaDto> ObtenerTrackingEmpleadoAsync(
        AsistenciaTrackingConsultaRequestDto request,
        CancellationToken cancellationToken = default);

    Task<AsistenciaGerencialPdfDto> ObtenerReporteGerencialAsync(
        AsistenciaGerencialPdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfGerencialEjecutivoAsync(
        AsistenciaGerencialPdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task ActualizarEstadoMarcacionAsync(
        AsistenciaActualizarEstadoMarcacionRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default);
}
