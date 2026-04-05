using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegRolService
{
    Task<IEnumerable<RolDto>> ListarAsync();
    Task<RolDto?> ObtenerPorIdAsync(int idRol);
    Task<int> CrearAsync(CrearRolRequest request, string usuario);
    Task<int> ActualizarAsync(int idRol, ActualizarRolRequest request, string usuario);
    Task<int> EliminarAsync(int idRol);
}
