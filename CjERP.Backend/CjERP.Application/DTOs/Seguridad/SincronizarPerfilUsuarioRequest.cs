namespace CjERP.Application.DTOs.Seguridad;

public class SincronizarPerfilUsuarioRequest
{
    public int IdPerfil { get; set; }
    public string IdUsuario { get; set; } = string.Empty;
}
