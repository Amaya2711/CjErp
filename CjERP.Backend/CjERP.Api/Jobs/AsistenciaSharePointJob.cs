using CjERP.Api.Services;
using Hangfire;

namespace CjERP.Api.Jobs;

public sealed class AsistenciaSharePointJob
{
    private readonly IAsistenciaSharePointService _service;

    public AsistenciaSharePointJob(IAsistenciaSharePointService service)
    {
        _service = service;
    }

    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
    public async Task EjecutarProgramadoAsync()
    {
        var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, AsistenciaSharePointTimeZone.Resolve());
        var fechaFin = now.Date;
        var fechaInicio = new DateTime(fechaFin.Year, fechaFin.Month, 1);
        await _service.EjecutarAsync(fechaInicio, fechaFin, "AUTOMATICO", "SISTEMA");
    }

    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
    public Task EjecutarManualAsync(DateTime fechaInicio, DateTime fechaFin, string usuario)
    {
        return _service.EjecutarAsync(fechaInicio, fechaFin, "MANUAL", usuario);
    }

    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
    public Task ReintentarAsync(DateTime fechaInicio, DateTime fechaFin, string usuario)
    {
        return _service.EjecutarAsync(fechaInicio, fechaFin, "REINTENTO", usuario);
    }
}

internal static class AsistenciaSharePointTimeZone
{
    public static TimeZoneInfo Resolve()
    {
        foreach (var timeZoneId in new[] { "SA Pacific Standard Time", "America/Lima" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.Utc;
    }
}
