using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ICxcCargaService
{
    Task<CxcCargaSireResponseDto> CargarSireAsync(CxcCargaSireRequestDto request, string? usuario, CancellationToken cancellationToken = default);

    Task<List<CxcDocumentoDto>> ListarDocumentosAsync(string? periodo, CancellationToken cancellationToken = default);
}
