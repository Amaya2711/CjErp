namespace CjERP.Application.DTOs.Seguridad;

public class GuardarAsignacionMenuRolRequest
{
    public int IdPerfil { get; set; }
    public int IdRol { get; set; }
    public List<MenuAsignadoDto> Menus { get; set; } = new();
}

public class MenuAsignadoDto
{
    public int IdMenu { get; set; }
    public bool Acceso { get; set; }
}