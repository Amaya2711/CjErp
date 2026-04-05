namespace CjERP.Application.DTOs.Seguridad;

public class CrearRolRequest
{
    public string NombreRol { get; set; } = string.Empty;
    public string Descripcion { get; set; } = string.Empty;
    public bool EsActivo { get; set; } = true;
}
