namespace CjERP.Application.DTOs;

public sealed class EmpleadoResponsableInsertarRequestDto
{
    public int? IdEmpleado { get; set; }
    public int? IdBancoCta { get; set; }
    public int? IdBancoActual { get; set; }
    public string CuentaActual { get; set; } = string.Empty;
    public string NombreCtaActual { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string Cuenta { get; set; } = string.Empty;
    public string CuentaInter { get; set; } = string.Empty;
    public string TipoCuenta { get; set; } = string.Empty;
    public string NombreCta { get; set; } = string.Empty;
    public string Banco { get; set; } = string.Empty;
    public string IdBanco { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
    public string UsuarioAccion { get; set; } = string.Empty;
    public string FechaCreacion { get; set; } = string.Empty;
}
