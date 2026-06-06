namespace CjERP.Application.DTOs;

public class PlanillaBoletaSuspensionPdfDto
{
    public string Tipo { get; set; } = string.Empty;
    public string Motivo { get; set; } = string.Empty;
    public decimal Dias { get; set; }
}
