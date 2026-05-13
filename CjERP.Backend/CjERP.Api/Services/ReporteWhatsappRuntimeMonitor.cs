using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Services;

public sealed class ReporteWhatsappRuntimeMonitor : IReporteWhatsappRuntimeMonitor
{
    private readonly object _sync = new();
    private readonly Dictionary<string, ReporteWhatsappRuntimeStatusDto> _snapshots = new(StringComparer.OrdinalIgnoreCase);

    public bool TryStart(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot)
    {
        lock (_sync)
        {
            var key = ReporteWhatsappTipos.Normalize(tipoReporte);
            if (_snapshots.TryGetValue(key, out var current) && current.IsRunning)
            {
                return false;
            }

            _snapshots[key] = Clone(snapshot);
            return true;
        }
    }

    public void Update(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot)
    {
        lock (_sync)
        {
            _snapshots[ReporteWhatsappTipos.Normalize(tipoReporte)] = Clone(snapshot);
        }
    }

    public void Finish(string tipoReporte, ReporteWhatsappRuntimeStatusDto snapshot)
    {
        lock (_sync)
        {
            _snapshots[ReporteWhatsappTipos.Normalize(tipoReporte)] = Clone(snapshot);
        }
    }

    public ReporteWhatsappRuntimeStatusDto GetSnapshot(string tipoReporte)
    {
        lock (_sync)
        {
            var key = ReporteWhatsappTipos.Normalize(tipoReporte);
            return _snapshots.TryGetValue(key, out var snapshot)
                ? Clone(snapshot)
                : new ReporteWhatsappRuntimeStatusDto { TipoReporte = key };
        }
    }

    private static ReporteWhatsappRuntimeStatusDto Clone(ReporteWhatsappRuntimeStatusDto source)
    {
        return new ReporteWhatsappRuntimeStatusDto
        {
            TipoReporte = source.TipoReporte,
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
