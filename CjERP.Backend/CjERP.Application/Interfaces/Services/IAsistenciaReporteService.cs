using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IAsistenciaReporteService
{
    Task<IEnumerable<AsistenciaReporteDto>> BuscarAsync(
        AsistenciaReporteRequestDto request,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfGerencialAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default);
}
