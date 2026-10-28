using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IVentasSunatService
{
    Task<VentasSunatCargaResultDto> CargarAsync(
        IReadOnlyCollection<VentasSunatFilaDto> datos,
        string? usuario,
        CancellationToken cancellationToken = default);

    Task<VentasSunatValidacionResultDto> ValidarAsync(Guid lote, CancellationToken cancellationToken = default);

    /// <summary>Periodos ya cargados (el mas reciente primero).</summary>
    Task<IReadOnlyList<VentasSunatPeriodoDto>> ListarPeriodosAsync(CancellationToken cancellationToken = default);

    /// <summary>Indica si el periodo (AAAAMM) del RUC emisor ya esta cargado y devuelve su historial.</summary>
    Task<VentasSunatHistorialDto> ConsultarPeriodoAsync(string periodo, string rucEmisor, CancellationToken cancellationToken = default);

    /// <summary>Registros del ultimo lote de cada periodo y RUC emisor del anio (AAAA), en una sola consulta.</summary>
    Task<IReadOnlyList<VentasSunatRegistroDto>> ConsultarAnioAsync(string anio, CancellationToken cancellationToken = default);
}
