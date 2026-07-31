using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IMigracionImportService
{
    Task<MigracionImportAnalisisDto> AnalizarAsync(
        byte[] archivoBytes,
        string nombreArchivo,
        CancellationToken cancellationToken = default);

    Task<MigracionImportEjecucionResultadoDto> AplicarAsync(
        byte[] archivoBytes,
        string nombreArchivo,
        MigracionImportModo modo,
        CancellationToken cancellationToken = default);
}
