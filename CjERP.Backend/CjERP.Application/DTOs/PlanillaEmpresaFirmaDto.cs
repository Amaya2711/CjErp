namespace CjERP.Application.DTOs;

public class PlanillaEmpresaFirmaDto
{
    public string Ruc { get; set; } = string.Empty;
    public string RazonSocial { get; set; } = string.Empty;
    public string NombreCorto { get; set; } = string.Empty;
    public string RutaFirma { get; set; } = string.Empty;
    public string FirmaBase64 { get; set; } = string.Empty;
    public string NombreRepresentante { get; set; } = string.Empty;
    public string CargoRepresentante { get; set; } = string.Empty;
    public int? IdActivo { get; set; }
}
