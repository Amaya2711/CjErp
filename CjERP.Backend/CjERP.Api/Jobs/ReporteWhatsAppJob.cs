using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Jobs;

public sealed class ReporteWhatsAppJob
{
    private readonly IReporteAutomaticoService _reporteAutomaticoService;

    public ReporteWhatsAppJob(IReporteAutomaticoService reporteAutomaticoService)
    {
        _reporteAutomaticoService = reporteAutomaticoService;
    }

    public Task EjecutarProgramadoAsync(string tipoReporte)
    {
        return _reporteAutomaticoService.EjecutarAsync(ReporteWhatsappTipos.Normalize(tipoReporte), "AUTOMATICO", "HANGFIRE", false, null);
    }

    public Task EjecutarManualAsync(string tipoReporte, string usuarioEjecucion, string? periodo = null)
    {
        return _reporteAutomaticoService.EjecutarAsync(ReporteWhatsappTipos.Normalize(tipoReporte), "MANUAL", usuarioEjecucion, false, periodo);
    }

    public Task ReintentarFallidosAsync(string tipoReporte, string usuarioEjecucion, string? periodo = null)
    {
        return _reporteAutomaticoService.EjecutarAsync(ReporteWhatsappTipos.Normalize(tipoReporte), "REINTENTO", usuarioEjecucion, true, periodo);
    }
}
