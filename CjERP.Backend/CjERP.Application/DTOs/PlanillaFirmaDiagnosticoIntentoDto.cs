namespace CjERP.Application.DTOs;

public sealed class PlanillaFirmaDiagnosticoIntentoDto
{
    public string Etapa { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public bool Exitoso { get; set; }
    public int? StatusCode { get; set; }
    public string Mensaje { get; set; } = string.Empty;
    public int BytesDescargados { get; set; }
}
