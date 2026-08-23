using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IMigracionImportProcesarNewService
{
    Task<MigracionImportProcesarNewResultadoDto> ProcesarAsync(
        IReadOnlyCollection<MigracionImportProcesarNewFilaDto> datos,
        string accion,
        CancellationToken cancellationToken = default);
}
