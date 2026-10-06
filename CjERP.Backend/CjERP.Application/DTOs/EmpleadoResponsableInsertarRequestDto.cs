namespace CjERP.Application.DTOs;

public sealed class EmpleadoResponsableInsertarRequestDto
{
    public string Nombre { get; set; } = string.Empty;
    public string Cuenta { get; set; } = string.Empty;
    public string CuentaInter { get; set; } = string.Empty;
    public string TipoCuenta { get; set; } = string.Empty;
    public string Banco { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
    public string UsuarioAccion { get; set; } = string.Empty;
}
