namespace CjERP.Application.DTOs.Seguridad;

public class GuardarSegRolMenuPermisoDto
{
    public int IdRol { get; set; }
    public int IdMenu { get; set; }

    public bool PuedeVer { get; set; }
    public bool PuedeCrear { get; set; }
    public bool PuedeEditar { get; set; }
    public bool PuedeEliminar { get; set; }
    public bool PuedeAprobar { get; set; }
    public bool PuedeExportar { get; set; }

    public string Usuario { get; set; } = string.Empty;
}