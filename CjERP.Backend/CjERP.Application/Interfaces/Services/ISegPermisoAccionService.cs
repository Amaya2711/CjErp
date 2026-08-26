using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegPermisoAccionService
{
    Task<IEnumerable<PermisoAccionDto>> ListarAsync(string? rutaPagina = null, int? idRol = null, int? idEmpleado = null, string? tipoElemento = null);
    Task<PermisoAccionDto?> ObtenerAsync(int idPermisoAccion);
    Task<int> GuardarAsync(GuardarPermisoAccionRequestDto request, string usuario);
    Task<int> EliminarAsync(int idPermisoAccion);
}
