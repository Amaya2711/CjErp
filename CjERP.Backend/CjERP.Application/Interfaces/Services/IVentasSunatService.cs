using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IVentasSunatService
{
    Task<VentasSunatCargaResultDto> CargarAsync(
        IReadOnlyCollection<VentasSunatFilaDto> datos,
        string? usuario,
        CancellationToken cancellationToken = default);

    Task<VentasSunatValidacionResultDto> ValidarAsync(Guid lote, CancellationToken cancellationToken = default);
}
