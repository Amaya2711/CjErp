using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface ICxcDetraccionesService
{
    Task<CxcCargaDetraccionesResponseDto> CargarAsync(CxcCargaDetraccionesRequestDto request, string? usuario, CancellationToken cancellationToken = default);

    Task<List<CxcDetraccionDto>> ListarAsync(CancellationToken cancellationToken = default);
}
