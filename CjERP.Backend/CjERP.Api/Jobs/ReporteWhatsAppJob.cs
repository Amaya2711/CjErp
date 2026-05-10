using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Jobs;

public sealed class ReporteWhatsAppJob
{
    private readonly IReporteAutomaticoService _reporteAutomaticoService;

    public ReporteWhatsAppJob(IReporteAutomaticoService reporteAutomaticoService)
    {
        _reporteAutomaticoService = reporteAutomaticoService;
    }

    public Task EjecutarProgramadoAsync()
    {
        return _reporteAutomaticoService.EjecutarAsync("AUTOMATICO", "HANGFIRE", false);
    }

    public Task EjecutarManualAsync(string usuarioEjecucion)
    {
        return _reporteAutomaticoService.EjecutarAsync("MANUAL", usuarioEjecucion, false);
    }

    public Task ReintentarFallidosAsync(string usuarioEjecucion)
    {
        return _reporteAutomaticoService.EjecutarAsync("REINTENTO", usuarioEjecucion, true);
    }
}
