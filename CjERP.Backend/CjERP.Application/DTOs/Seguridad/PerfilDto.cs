namespace CjERP.Application.DTOs.Seguridad;

public class PerfilDto
{
    public int IdPerfil { get; set; }
    public string NombrePerfil { get; set; } = string.Empty;
    public string Descripcion { get; set; } = string.Empty;
    public bool EsActivo { get; set; }
    public DateTime FechaCreacion { get; set; }
}