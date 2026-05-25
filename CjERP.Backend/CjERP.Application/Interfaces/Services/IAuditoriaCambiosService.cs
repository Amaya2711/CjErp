using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IAuditoriaCambiosService
{
    Task RegistrarAsync(AuditoriaCambioDto cambio, CancellationToken cancellationToken = default);

    Task RegistrarLoteAsync(IEnumerable<AuditoriaCambioDto> cambios, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AuditoriaCambioConsultaDto>> ConsultarAsync(
        AuditoriaCambioFiltroDto filtro,
        CancellationToken cancellationToken = default);
}
