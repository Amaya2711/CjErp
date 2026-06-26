using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IConciliacionBcpService
{
    Task<ConciliacionBcpAnalizarResponseDto> AnalizarAsync(
        ConciliacionBcpAnalizarRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default);

    Task<ConciliacionBcpInsertResponseDto> InsertarAsync(
        ConciliacionBcpInsertRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default);

    Task<ConciliacionBcpExportResponseDto> ExportarAnalisisAsync(
        ConciliacionBcpExportRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default);

    Task<ConciliacionBcpConciliarPlanillaResponseDto> ConciliarPlanillaAsync(
        ConciliacionBcpConciliarPlanillaRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default);

    Task<ConciliacionBcpConciliarPlanillaRegistroDto> ActualizarComentarioMovimientoAsync(
        int idMovimientoBanco,
        ConciliacionBcpActualizarComentarioRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default);
}
