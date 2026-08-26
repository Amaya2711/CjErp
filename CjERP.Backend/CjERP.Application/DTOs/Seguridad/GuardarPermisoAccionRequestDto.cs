namespace CjERP.Application.DTOs.Seguridad;

public class GuardarPermisoAccionRequestDto
{
    public int? IdPermisoAccion { get; set; }

    public string RutaPagina { get; set; } = string.Empty;
    public string ClaveAccion { get; set; } = string.Empty;
    public string? Etiqueta { get; set; }
    public string TipoElemento { get; set; } = string.Empty;

    public int? IdRol { get; set; }
    public int? IdEmpleado { get; set; }

    public bool PuedeVer { get; set; }
    public bool PuedeEjecutar { get; set; }
    public bool EsActivo { get; set; } = true;

    public string Usuario { get; set; } = string.Empty;
}
