namespace CjERP.Application.DTOs;

public sealed class PlanillaFirmaDiagnosticoDto
{
    public int IdBoleta { get; set; }
    public string Ruc { get; set; } = string.Empty;
    public string RutaFirmaOriginal { get; set; } = string.Empty;
    public bool FirmaBase64InicialDisponible { get; set; }
    public bool FirmaBase64FinalDisponible { get; set; }
    public int FirmaBase64FinalLength { get; set; }
    public List<string> CandidateUrls { get; set; } = new();
    public List<PlanillaFirmaDiagnosticoIntentoDto> Intentos { get; set; } = new();
    public string MensajeFinal { get; set; } = string.Empty;
}
