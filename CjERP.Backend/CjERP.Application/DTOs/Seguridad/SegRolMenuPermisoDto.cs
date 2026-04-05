namespace CjERP.Application.DTOs.Seguridad;

public class SegRolMenuPermisoDto
{
    public int? IdRolMenuPermiso { get; set; }
    public int IdRol { get; set; }
    public int IdMenu { get; set; }

    public string NombreMenu { get; set; } = string.Empty;
    public string? CodigoMenu { get; set; }
    public string? Ruta { get; set; }
    public int? IdMenuPadre { get; set; }
    public int? Orden { get; set; }

    public bool PuedeVer { get; set; }
    public bool PuedeCrear { get; set; }
    public bool PuedeEditar { get; set; }
    public bool PuedeEliminar { get; set; }
    public bool PuedeAprobar { get; set; }
    public bool PuedeExportar { get; set; }

    public bool Estado { get; set; }
}