namespace CjERP.Application.DTOs.Seguridad;

/// <summary>Estado actual del usuario y TODOS sus roles activos (el JWT solo lleva uno de ellos).</summary>
public class AccesoUsuarioDto
{
    /// <summary>Usuario.IdEstado = 1.</summary>
    public bool Activo { get; set; }
    public IReadOnlyList<int> Roles { get; set; } = Array.Empty<int>();
}
