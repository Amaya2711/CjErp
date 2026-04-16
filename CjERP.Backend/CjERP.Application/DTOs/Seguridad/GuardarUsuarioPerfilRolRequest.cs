namespace CjERP.Application.DTOs.Seguridad;

public class GuardarUsuarioPerfilRolRequest
{
    public string IdUsuario { get; set; } = string.Empty;
    public int IdPerfil { get; set; }
    public int IdRol { get; set; }
}
