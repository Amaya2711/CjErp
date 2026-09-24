using System.Globalization;
using CjERP.Api.Jobs;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using Hangfire;

namespace CjERP.Api.Services;

public interface IAsistenciaSharePointJobScheduler
{
    Task ReprogramarAsync(CancellationToken cancellationToken = default);
    Task<AsistenciaSharePointConfigDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(AsistenciaSharePointConfigUpdateDto request, string usuario, CancellationToken cancellationToken = default);
    string EncolarEjecucionManual(DateTime fechaInicio, DateTime fechaFin, string usuario);
    Task<string?> EncolarReintentoAsync(long logId, string usuario, CancellationToken cancellationToken = default);
}

public sealed class AsistenciaSharePointJobScheduler : IAsistenciaSharePointJobScheduler
{
    public const string JobId = "asistencia-sharepoint-diario";
    private const string CodigoJob = "ASISTENCIA_SHAREPOINT";
    private readonly IRecurringJobManager _recurringJobManager;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IAsistenciaSharePointRepository _repository;

    public AsistenciaSharePointJobScheduler(
        IRecurringJobManager recurringJobManager,
        IBackgroundJobClient backgroundJobClient,
        IAsistenciaSharePointRepository repository)
    {
        _recurringJobManager = recurringJobManager;
        _backgroundJobClient = backgroundJobClient;
        _repository = repository;
    }

    public async Task ReprogramarAsync(CancellationToken cancellationToken = default)
    {
        var config = await ObtenerConfiguracionAsync(cancellationToken);
        if (!config.Activo)
        {
            _recurringJobManager.RemoveIfExists(JobId);
            return;
        }

        if (!TimeSpan.TryParse(config.HoraEjecucion, CultureInfo.InvariantCulture, out var time))
        {
            throw new InvalidOperationException("La hora de ejecucion del job de asistencia no es valida.");
        }

        _recurringJobManager.AddOrUpdate<AsistenciaSharePointJob>(
            JobId,
            job => job.EjecutarProgramadoAsync(),
            Cron.Daily(time.Hours, time.Minutes),
            new RecurringJobOptions { TimeZone = AsistenciaSharePointTimeZone.Resolve() });
    }

    public async Task<AsistenciaSharePointConfigDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        return await _repository.ObtenerConfiguracionAsync(cancellationToken)
            ?? new AsistenciaSharePointConfigDto();
    }

    public async Task ActualizarConfiguracionAsync(
        AsistenciaSharePointConfigUpdateDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        if (!TimeSpan.TryParse(request.HoraEjecucion, CultureInfo.InvariantCulture, out var time) ||
            time < TimeSpan.Zero || time >= TimeSpan.FromDays(1))
        {
            throw new ArgumentException("La hora de ejecucion no es valida.");
        }

        var config = new AsistenciaSharePointConfigDto
        {
            CodigoJob = CodigoJob,
            Activo = request.Activo,
            HoraEjecucion = time.ToString(@"hh\:mm", CultureInfo.InvariantCulture),
            TimeZone = "SA Pacific Standard Time",
            CronExpression = $"{time.Minutes} {time.Hours} * * *"
        };
        await _repository.GuardarConfiguracionAsync(config, usuario, cancellationToken);
        await ReprogramarAsync(cancellationToken);
    }

    public string EncolarEjecucionManual(DateTime fechaInicio, DateTime fechaFin, string usuario)
    {
        ValidateDates(fechaInicio, fechaFin);
        return _backgroundJobClient.Enqueue<AsistenciaSharePointJob>(
            job => job.EjecutarManualAsync(fechaInicio.Date, fechaFin.Date, usuario));
    }

    public async Task<string?> EncolarReintentoAsync(long logId, string usuario, CancellationToken cancellationToken = default)
    {
        var log = await _repository.ObtenerLogAsync(logId, cancellationToken);
        if (log is null || !string.Equals(log.Estado, "ERROR", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return _backgroundJobClient.Enqueue<AsistenciaSharePointJob>(
            job => job.ReintentarAsync(log.FechaInicio, log.FechaFin, usuario));
    }

    private static void ValidateDates(DateTime fechaInicio, DateTime fechaFin)
    {
        if (fechaInicio.Date > fechaFin.Date)
        {
            throw new ArgumentException("La fecha de inicio no puede ser mayor que la fecha fin.");
        }
    }
}
