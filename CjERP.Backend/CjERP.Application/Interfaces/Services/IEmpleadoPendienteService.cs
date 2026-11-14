using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IEmpleadoPendienteService
{
    Task<IEnumerable<EmpleadoPendienteDto>> BuscarAsync(
        EmpleadoPendienteBuscarRequestDto request,
        CancellationToken cancellationToken = default);

    /// <summary>PDF con todos los pendientes agrupados por la relación empleado / responsable. Null si no hay datos.</summary>
    Task<(byte[] Contenido, string NombreArchivo)?> GenerarPdfAsync(
        EmpleadoPendientePdfRequestDto request,
        CancellationToken cancellationToken = default);

    Task<EmpleadoPendienteCommandResultDto> InsertarAsync(
        EmpleadoPendienteInsertRequestDto request,
        CancellationToken cancellationToken = default);

    Task<EmpleadoPendienteCommandResultDto> ActualizarAsync(
        EmpleadoPendienteUpdateRequestDto request,
        CancellationToken cancellationToken = default);
}
