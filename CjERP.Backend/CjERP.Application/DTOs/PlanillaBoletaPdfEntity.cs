namespace CjERP.Application.DTOs;

public class PlanillaBoletaPdfEntity
{
    public int IdPdf { get; set; }
    public int IdBoleta { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public string RutaArchivo { get; set; } = string.Empty;
    public string ArchivoBase64 { get; set; } = string.Empty;
    public string? FechaGeneracion { get; set; }
    public bool Enviado { get; set; }
    public string? FechaEnvio { get; set; }
    public string MedioEnvio { get; set; } = string.Empty;
}
