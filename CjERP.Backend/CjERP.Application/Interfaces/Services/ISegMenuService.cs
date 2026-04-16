using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegMenuService
    /// <summary>
    /// Crea la relación usuario-perfil.
    /// </summary>
    /// <param name="idUsuario">ID del usuario</param>
    /// <param name="idPerfil">ID del perfil</param>
    /// <param name="usuario">Usuario que realiza la acción</param>
    
{
    Task GuardarUsuarioPerfilAsync(string idUsuario, int idPerfil, string usuario);
    Task<IEnumerable<MenuDto>> ListarCompletoAsync();
    Task<IEnumerable<MenuDto>> ListarDinamicoTotalAsync();
    Task<IEnumerable<MenuDto>> ListarDinamicoPorPerfilAsync(int idPerfil);
    Task<IEnumerable<MenuDto>> ListarPorUsuarioAsync(string idUsuario);
    Task<int> CrearMenuAsync(CrearMenuPrincipalRequest request, string usuario);
    Task<IEnumerable<MenuDto>> ListarAsignadoPorPerfilRolAsync(int idPerfil, int idRol);
    Task GuardarAsignacionPerfilRolAsync(int idPerfil, int idRol, IEnumerable<MenuAsignadoDto> menus, string usuario);
    Task GuardarUsuarioPerfilRolAsync(string idUsuario, int idPerfil, int idRol, string usuario);
    Task<int> SincronizarPerfilUsuarioAsync(int idPerfil, string idUsuario);
    Task<IEnumerable<MenuDto>> ListarMenuDinamicoAsync(string? idUsuario, int? idPerfil, int? idRol);

    /// <summary>
    /// Verifica si existe una relación activa usuario-perfil.
    /// </summary>
    /// <param name="idUsuario">ID del usuario</param>
    /// <param name="idPerfil">ID del perfil</param>
    /// <returns>True si existe la relación, false si no.</returns>
    Task<bool> ExisteUsuarioPerfilAsync(string idUsuario, int idPerfil);

}
