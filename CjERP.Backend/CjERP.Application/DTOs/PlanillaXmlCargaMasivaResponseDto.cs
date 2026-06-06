namespace CjERP.Application.DTOs;

public class PlanillaXmlCargaMasivaResponseDto
{
    public int TotalArchivos { get; set; }
    public int Validos { get; set; }
    public int ConError { get; set; }
    public int Importados { get; set; }
    public int Fallidos { get; set; }
    public int PdfGenerados { get; set; }
    public int PdfReutilizados { get; set; }
    public int PdfDisponibles { get; set; }
    public int PdfConError { get; set; }
    public List<PlanillaXmlResultadoDto> Resultados { get; set; } = [];
}
