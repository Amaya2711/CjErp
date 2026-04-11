namespace CjERP.Application.DTOs.Seguridad;

public class CrearMenuPrincipalRequest
{
    public string NombreMenu { get; set; } = string.Empty;
    public string? CodigoMenu { get; set; }
    public string? Icono { get; set; }
    public int OrdenMenu { get; set; }
    public bool EsVisible { get; set; } = true;
    public bool EsActivo { get; set; } = true;
}
