using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Repositories;

public interface IPlanillaBoletaRepository
{
    Task<PlanillaXmlResultadoDto> ImportarXmlAsync(
        string nombreArchivo,
        string xml,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<bool> ExisteBoletaDuplicadaActivaAsync(
        string periodo,
        string numeroDocumento,
        int idActivo,
        CancellationToken cancellationToken = default);

    Task<PlanillaBoletaPdfDto?> ObtenerBoletaPdfAsync(int idBoleta, CancellationToken cancellationToken = default);

    Task<PlanillaBoletaPdfEntity?> ObtenerPdfExistenteAsync(int idBoleta, CancellationToken cancellationToken = default);

    Task RegistrarPdfAsync(PlanillaBoletaPdfEntity pdf, CancellationToken cancellationToken = default);

    Task ActualizarEstadoEnvioAsync(
        int idBoleta,
        bool enviado,
        string? medioEnvio,
        string? fechaEnvio,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<int>> ListarBoletasPorPeriodoAsync(string periodo, CancellationToken cancellationToken = default);
}
