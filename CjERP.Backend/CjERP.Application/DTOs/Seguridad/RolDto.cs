namespace CjERP.Application.DTOs.Seguridad;

public class RolDto
{
    public int IdRol { get; set; }
    public string NombreRol { get; set; } = string.Empty;
    public string Descripcion { get; set; } = string.Empty;
    public bool EsActivo { get; set; }
    public DateTime FechaCreacion { get; set; }
}