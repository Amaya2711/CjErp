using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Services;

public sealed class ReporteWhatsappRuntimeMonitor : IReporteWhatsappRuntimeMonitor
{
    private readonly object _sync = new();
    private ReporteWhatsappRuntimeStatusDto _snapshot = new();

    public bool TryStart(ReporteWhatsappRuntimeStatusDto snapshot)
    {
        lock (_sync)
        {
            if (_snapshot.IsRunning)
            {
                return false;
            }

            _snapshot = Clone(snapshot);
            return true;
        }
    }

    public void Update(ReporteWhatsappRuntimeStatusDto snapshot)
    {
        lock (_sync)
        {
            _snapshot = Clone(snapshot);
        }
    }

    public void Finish(ReporteWhatsappRuntimeStatusDto snapshot)
    {
        lock (_sync)
        {
            _snapshot = Clone(snapshot);
        }
    }

    public ReporteWhatsappRuntimeStatusDto GetSnapshot()
    {
        lock (_sync)
        {
            return Clone(_snapshot);
        }
    }

    private static ReporteWhatsappRuntimeStatusDto Clone(ReporteWhatsappRuntimeStatusDto source)
    {
        return new ReporteWhatsappRuntimeStatusDto
        {
            ExecutionId = source.ExecutionId,
            IsRunning = source.IsRunning,
            OrigenEjecucion = source.OrigenEjecucion,
            UsuarioEjecucion = source.UsuarioEjecucion,
            FechaInicio = source.FechaInicio,
            FechaFin = source.FechaFin,
            Mensaje = source.Mensaje,
            TotalEmpleados = source.TotalEmpleados,
            EmpleadosProcesados = source.EmpleadosProcesados,
            Enviados = source.Enviados,
            Errores = source.Errores,
            Omitidos = source.Omitidos,
            Duplicados = source.Duplicados,
            BloqueActual = source.BloqueActual,
            TotalBloques = source.TotalBloques,
            EmpleadoActualId = source.EmpleadoActualId,
            EmpleadoActualNombre = source.EmpleadoActualNombre,
            SegundosRestantesEstimados = source.SegundosRestantesEstimados,
            SegundosEsperaBloqueActual = source.SegundosEsperaBloqueActual,
            Periodo = source.Periodo is null
                ? null
                : new ReporteWhatsappPeriodoDto
                {
                    FechaInicio = source.Periodo.FechaInicio,
                    FechaFin = source.Periodo.FechaFin,
                    FechaProceso = source.Periodo.FechaProceso,
                    EtiquetaPeriodo = source.Periodo.EtiquetaPeriodo
                }
        };
    }
}
