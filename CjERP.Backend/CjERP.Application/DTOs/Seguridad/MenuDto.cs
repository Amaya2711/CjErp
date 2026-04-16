namespace CjERP.Application.DTOs.Seguridad;

public class MenuDto
{
    public int IdMenu { get; set; }
    public int? IdMenuPadre { get; set; }
    public string NombreMenu { get; set; } = string.Empty;
    public string? Ruta { get; set; }
    public string? Icono { get; set; }
    public int OrdenMenu { get; set; }
    public int NivelMenu { get; set; }
    public string? CodigoMenu { get; set; }
    // Indica si el usuario tiene acceso a este menú
    public int? Acceso { get; set; }
}