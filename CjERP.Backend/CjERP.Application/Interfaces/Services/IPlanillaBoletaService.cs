using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IPlanillaBoletaService
{
    Task<PlanillaXmlCargaMasivaResponseDto> ValidarXmlMasivoAsync(
        IReadOnlyList<PlanillaXmlArchivoDto> archivos,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<PlanillaXmlCargaMasivaResponseDto> ImportarXmlMasivoAsync(
        IReadOnlyList<PlanillaXmlArchivoDto> archivos,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarPdfBoletaAsync(int idBoleta, CancellationToken cancellationToken = default);

    Task<string> ObtenerPdfBase64Async(int idBoleta, CancellationToken cancellationToken = default);

    Task<int?> ObtenerIdBoletaPorPeriodoYNroDocumentoAsync(
        string periodo,
        string numeroDocumento,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerarZipPeriodoAsync(string periodo, CancellationToken cancellationToken = default);

    Task EnviarBoletaPreparadaAsync(int idBoleta, string medioEnvio, string destino, CancellationToken cancellationToken = default);

    Task<PlanillaFirmaDiagnosticoDto> ObtenerDiagnosticoFirmaAsync(int idBoleta, CancellationToken cancellationToken = default);
}
