namespace CjERP.Application.DTOs;

public class PlanillaXmlResultadoDto
{
    public string NombreArchivo { get; set; } = string.Empty;
    public bool Valido { get; set; }
    public bool Importado { get; set; }
    public string Estado { get; set; } = string.Empty;
    public string Mensaje { get; set; } = string.Empty;
    public string? Periodo { get; set; }
    public string? NumeroDocumento { get; set; }
    public string? NombreTrabajador { get; set; }
    public int? IdBoleta { get; set; }
    public string? FechaValidacion { get; set; }
    public string? FechaImportacion { get; set; }
    public bool PdfGenerado { get; set; }
    public bool PdfReutilizado { get; set; }
    public bool PdfDisponible { get; set; }
    public string? MensajePdf { get; set; }
}
