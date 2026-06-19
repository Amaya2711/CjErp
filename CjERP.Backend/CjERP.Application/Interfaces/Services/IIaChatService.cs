using CjERP.Application.DTOs.IaChat;

namespace CjERP.Application.Interfaces.Services;

public interface IIaChatService
{
    Task<IaChatResponseDto> ConsultarAsync(
        IaChatConsultarRequestDto request,
        string? idUsuario,
        CancellationToken cancellationToken = default);

    Task<IaChatDashboardExportResponseDto> GenerarDashboardReporteAsync(
        IaChatDashboardExportRequestDto request,
        string? idUsuario,
        CancellationToken cancellationToken = default);
}
