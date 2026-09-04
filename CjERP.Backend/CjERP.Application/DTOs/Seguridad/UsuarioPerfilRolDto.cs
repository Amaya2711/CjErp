namespace CjERP.Application.DTOs.Seguridad;

public sealed class UsuarioPerfilRolDto
{
    public string IdUsuario { get; set; } = string.Empty;
    public int IdPerfil { get; set; }
    public string NombrePerfil { get; set; } = string.Empty;
    public int IdRol { get; set; }
    public string NombreRol { get; set; } = string.Empty;
}
