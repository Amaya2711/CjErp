using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegRolMenuPermisoService
{
    Task<IEnumerable<SegRolMenuPermisoDto>> ListarPorRolAsync(int idRol);
    Task<SegRolMenuPermisoDto?> ObtenerAsync(int idRol, int idMenu);
    Task GuardarAsync(GuardarSegRolMenuPermisoDto dto);

    /// <summary>Estado del usuario y sus roles activos que pertenecen a la aplicacion indicada (SegRolApp). Lo usa [RequiereMenu].</summary>
    Task<AccesoUsuarioDto> ObtenerAccesoUsuarioAsync(string idUsuario, string app);
}