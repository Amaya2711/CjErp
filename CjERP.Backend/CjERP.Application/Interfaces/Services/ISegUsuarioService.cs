using CjERP.Application.DTOs.Seguridad;

namespace CjERP.Application.Interfaces.Services;

public interface ISegUsuarioService
{
    Task<IEnumerable<UsuarioDto>> ListarAsync();
}
