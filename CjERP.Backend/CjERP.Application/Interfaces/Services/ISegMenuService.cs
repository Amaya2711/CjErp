using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegMenuService
{
    Task<IEnumerable<MenuDto>> ListarCompletoAsync();
    Task<IEnumerable<MenuDto>> ListarDinamicoTotalAsync();
    Task<IEnumerable<MenuDto>> ListarDinamicoPorPerfilAsync(int idPerfil);
    Task<IEnumerable<MenuDto>> ListarPorUsuarioAsync(string idUsuario);
    Task<int> CrearMenuPrincipalAsync(CrearMenuPrincipalRequest request, string usuario);
    Task<IEnumerable<MenuDto>> ListarAsignadoPorPerfilRolAsync(int idPerfil, int idRol);
    Task GuardarAsignacionPerfilRolAsync(int idPerfil, int idRol, IEnumerable<int> menuIds, string usuario);
    Task<int> SincronizarPerfilUsuarioAsync(int idPerfil, string idUsuario);
}
