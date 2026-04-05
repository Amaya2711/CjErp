namespace CjERP.Application.DTOs.Seguridad;

public class ActualizarPerfilRequest
{
    public string NombrePerfil { get; set; } = string.Empty;
    public string Descripcion { get; set; } = string.Empty;
    public bool EsActivo { get; set; } = true;
}