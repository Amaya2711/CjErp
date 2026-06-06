namespace CjERP.Application.DTOs;

public class PlanillaBoletaCabeceraPdfDto
{
    public int IdBoleta { get; set; }
    public string Ruc { get; set; } = string.Empty;
    public string Empleador { get; set; } = string.Empty;
    public string Periodo { get; set; } = string.Empty;
    public string TipoDocumento { get; set; } = string.Empty;
    public string NumeroDocumento { get; set; } = string.Empty;
    public string NombreTrabajador { get; set; } = string.Empty;
    public string Situacion { get; set; } = string.Empty;
    public string FechaIngreso { get; set; } = string.Empty;
    public string TipoTrabajador { get; set; } = string.Empty;
    public string RegimenPensionario { get; set; } = string.Empty;
    public string CUSPP { get; set; } = string.Empty;
    public decimal DiasLaborados { get; set; }
    public decimal DiasNoLaborados { get; set; }
    public decimal DiasSubsidiados { get; set; }
    public string Condicion { get; set; } = string.Empty;
    public decimal JornadaHoras { get; set; }
    public decimal SobretiempoHoras { get; set; }
    public decimal NetoPagar { get; set; }
}
