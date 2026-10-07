namespace CjERP.Application.DTOs;

public sealed class EmpleadoResponsableBuscarDto
{
    public int? IdEmpleado { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public int? IdBancoCta { get; set; }
    public int? IdBanco { get; set; }
    public string NombreBanco { get; set; } = string.Empty;
    public string Cuenta { get; set; } = string.Empty;
    public string CuentaInter { get; set; } = string.Empty;
    public string NombreCta { get; set; } = string.Empty;
    // El store de bÃºsqueda expone el tipo de cuenta con este nombre.
    public string TipoCuenta { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
}
