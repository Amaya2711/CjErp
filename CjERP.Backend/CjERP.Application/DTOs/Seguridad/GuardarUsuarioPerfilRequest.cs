namespace CjERP.Application.DTOs.Seguridad;

public class GuardarUsuarioPerfilRequest
{
    public string IdUsuario { get; set; } = string.Empty;
    public int IdPerfil { get; set; }
}
