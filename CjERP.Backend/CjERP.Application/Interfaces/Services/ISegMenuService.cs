using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegMenuService
{
    Task<IEnumerable<MenuDto>> ListarCompletoAsync();
    Task<IEnumerable<MenuDto>> ListarPorUsuarioAsync(string idUsuario);
    Task<IEnumerable<MenuDto>> ListarAsignadoPorRolAsync(int idRol);
    Task GuardarAsignacionRolAsync(int idRol, IEnumerable<int> menuIds, string usuario);
}
