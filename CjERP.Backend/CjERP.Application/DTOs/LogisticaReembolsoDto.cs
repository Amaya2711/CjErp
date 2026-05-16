namespace CjERP.Application.DTOs;

public class LogisticaReembolsoBuscarRequestDto
{
    public int? Correlativo { get; set; }
}

public class LogisticaReembolsoUpdateRequestDto
{
    public int Correlativo { get; set; }
    public string? UsuarioActualizacion { get; set; }
    public string? Observacion { get; set; }
}

public class LogisticaReembolsoDto
{
    public int Correlativo { get; set; }
    public int? IdCliente { get; set; }
    public string? NombreCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? NombreProyecto { get; set; }
    public string? IdSite { get; set; }
    public string? NombreSite { get; set; }
    public string? Responsable { get; set; }
    public string? Solicitante { get; set; }
    public string? Detalle { get; set; }
    public string? Comentario { get; set; }
    public decimal? Monto { get; set; }
    public decimal? Subtotal { get; set; }
    public decimal? Igv { get; set; }
    public decimal? Total { get; set; }
    public string? Moneda { get; set; }
    public string? Estado { get; set; }
    public int? CodEstado { get; set; }
    public DateTime? FechaEmision { get; set; }
    public DateTime? FechaDeposito { get; set; }
    public DateTime? FechaVencimiento { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? Usuario { get; set; }
    public string? TipoPago { get; set; }
    public string? Comprobante { get; set; }
    public string? Serie { get; set; }
    public string? Ruc { get; set; }
    public bool? EsActivo { get; set; }
}
