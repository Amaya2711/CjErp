namespace CjERP.Application.DTOs.Seguridad;

public class GuardarAsignacionMenuRolRequest
{
    public int IdPerfil { get; set; }
    public int IdRol { get; set; }
    public List<int> MenuIds { get; set; } = new();
}