using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegRolMenuPermisoService
{
    Task<IEnumerable<SegRolMenuPermisoDto>> ListarPorRolAsync(int idRol);
    Task<SegRolMenuPermisoDto?> ObtenerAsync(int idRol, int idMenu);
    Task GuardarAsync(GuardarSegRolMenuPermisoDto dto);
}