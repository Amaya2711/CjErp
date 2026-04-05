using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegPerfilService
{
    Task<IEnumerable<PerfilDto>> ListarAsync();
    Task<PerfilDto?> ObtenerPorIdAsync(int idPerfil);
    Task<int> CrearAsync(CrearPerfilRequest request, string usuario);
    Task<int> ActualizarAsync(int idPerfil, ActualizarPerfilRequest request, string usuario);
    Task<int> EliminarAsync(int idPerfil);

    Task<IEnumerable<RolDto>> ListarRolesPorPerfilAsync(int idPerfil);
}