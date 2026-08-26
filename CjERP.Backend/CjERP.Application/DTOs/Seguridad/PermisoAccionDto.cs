namespace CjERP.Application.DTOs.Seguridad;

public class PermisoAccionDto
{
    public int IdPermisoAccion { get; set; }

    public string RutaPagina { get; set; } = string.Empty;
    public string? NombrePagina { get; set; }

    public string ClaveAccion { get; set; } = string.Empty;
    public string? Etiqueta { get; set; }
    public string TipoElemento { get; set; } = string.Empty;

    public int? IdRol { get; set; }
    public string? NombreRol { get; set; }

    public int? IdEmpleado { get; set; }
    public string? NombreEmpleado { get; set; }

    public bool PuedeVer { get; set; }
    public bool PuedeEjecutar { get; set; }
    public bool EsActivo { get; set; }

    public string? UsuarioCreacion { get; set; }
    public DateTime FechaCreacion { get; set; }
    public string? UsuarioModificacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
}
