namespace CjERP.Application.DTOs;

public class PlanillaBoletaPdfDto
{
    public PlanillaBoletaCabeceraPdfDto Cabecera { get; set; } = new();
    public List<PlanillaBoletaDetallePdfDto> Ingresos { get; set; } = [];
    public List<PlanillaBoletaDetallePdfDto> Descuentos { get; set; } = [];
    public List<PlanillaBoletaDetallePdfDto> AportesTrabajador { get; set; } = [];
    public List<PlanillaBoletaDetallePdfDto> AportesEmpleador { get; set; } = [];
    public List<PlanillaBoletaSuspensionPdfDto> Suspensiones { get; set; } = [];
    public PlanillaEmpresaFirmaDto? FirmaEmpresa { get; set; }
}
