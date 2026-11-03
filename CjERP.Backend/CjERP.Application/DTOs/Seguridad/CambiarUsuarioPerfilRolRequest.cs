namespace CjERP.Application.DTOs.Seguridad;

public class CambiarUsuarioPerfilRolRequest
{
    public string IdUsuario { get; set; } = string.Empty;
    public int IdPerfilAnterior { get; set; }
    public int IdRolAnterior { get; set; }
    public int IdPerfil { get; set; }
    public int IdRol { get; set; }
}
