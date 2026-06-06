namespace CjERP.Application.DTOs;

public class PlanillaBoletaDetallePdfDto
{
    public string Categoria { get; set; } = string.Empty;
    public string CodigoConcepto { get; set; } = string.Empty;
    public string Concepto { get; set; } = string.Empty;
    public decimal Monto { get; set; }
}
